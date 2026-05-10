#!/usr/bin/env node
/**
 * session-timeout-detector.js
 *
 * Detecteaza sesiunile abandonate (>2h fara activitate, fara pattern de inchidere).
 * Ruleaza periodic via cron (sugestie: la 15min). Marcheaza sesiunile abandonate intr-un
 * fisier de stare pe care hook-ul UserPromptSubmit il citeste la urmatoarea sesiune.
 *
 * Logica:
 *  - Scaneaza data/session-state/ pentru session markers
 *  - Pentru fiecare sesiune deschisa (marker exista), verifica daca memoria zilei
 *    a fost atinsa in ultimele {idleHours} ore si daca are pattern de inchidere.
 *  - Daca NU au fost atinse + sesiunea e mai veche decat threshold-ul → considera abandonata
 *  - Logheaza in data/session-timeout.log si marcheaza recovery flags pentru sesiunea urmatoare
 *
 * Output: NDJSON in data/session-timeout.log + sumar pe stdout (daca nu --quiet).
 *
 * Folosire:
 *  node scripts/session-timeout-detector.js               # default: idle 2h
 *  node scripts/session-timeout-detector.js --hours 4     # idle 4h
 *  node scripts/session-timeout-detector.js --quiet
 */

import { readdirSync, readFileSync, writeFileSync, statSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadEnv } from './lib/env-loader.js';
import { appendNdjson } from './lib/ndjson-log.js';
import { isClosed, extractOpenThreads } from './lib/memory-format.js';
import { getAllMemoryScopes } from './lib/client-context.js';
import { pruneDirByAge } from './lib/cleanup.js';

// Load .env BEFORE any process.env reads (cron jobs run without parent env)
loadEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROBOS_ROOT = join(__dirname, '..');
const STATE_DIR = join(ROBOS_ROOT, 'data', 'session-state');
const DATA_DIR = join(ROBOS_ROOT, 'data');
const TIMEOUT_LOG = join(DATA_DIR, 'session-timeout.log');
const RECOVERY_DIR = join(DATA_DIR, 'session-recovery');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { hours: 2, quiet: false, dryRun: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--hours' && args[i + 1]) {
      opts.hours = parseFloat(args[i + 1]) || 2;
      i++;
    } else if (args[i] === '--quiet' || args[i] === '-q') {
      opts.quiet = true;
    } else if (args[i] === '--dry-run') {
      opts.dryRun = true;
    }
  }
  return opts;
}

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Find the most recent memory file across ALL scopes (root + every client).
 *
 * F2 fix: previously hardcoded to ROBOS_ROOT/context/memory only, which meant
 * sessions writing under clients/{slug}/context/memory were silently
 * misclassified as "abandoned" because their memory files were invisible here.
 *
 * Returns the freshest one (by mtimeMs) across all scopes, with a `scope` label
 * for diagnostics.
 */
function readLatestMemoryContentAcrossScopes() {
  let best = null;

  for (const scope of getAllMemoryScopes()) {
    if (!existsSync(scope.dir)) continue;
    let files;
    try {
      files = readdirSync(scope.dir).filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f));
    } catch {
      continue;
    }
    if (files.length === 0) continue;

    files.sort().reverse();
    const path = join(scope.dir, files[0]);
    let stat;
    try { stat = statSync(path); } catch { continue; }

    if (!best || stat.mtimeMs > best.mtimeMs) {
      let content;
      try { content = readFileSync(path, 'utf-8'); } catch { continue; }
      best = {
        path,
        date: files[0].replace(/\.md$/, ''),
        content,
        mtimeMs: stat.mtimeMs,
        scope: scope.scope,
        scopeLabel: scope.label,
      };
    }
  }

  return best;
}

async function main() {
  const opts = parseArgs();
  const now = Date.now();
  const idleMs = opts.hours * 3600 * 1000;

  ensureDir(STATE_DIR);
  ensureDir(DATA_DIR);

  // Match any *.json marker except -checkpoint.json companions.
  // Earlier regex /^[^-]+\.json$/ excluded UUIDs (which always contain dashes),
  // so the detector silently never matched a real session marker.
  const markers = existsSync(STATE_DIR)
    ? readdirSync(STATE_DIR).filter(f => f.endsWith('.json') && !f.endsWith('-checkpoint.json'))
    : [];

  const abandoned = [];
  const ok = [];

  // Check each session marker
  for (const marker of markers) {
    const path = join(STATE_DIR, marker);
    const sessionId = marker.replace(/\.json$/, '');
    try {
      const data = JSON.parse(readFileSync(path, 'utf-8'));
      const startedMs = new Date(data.started_at).getTime();
      const ageMs = now - startedMs;

      if (ageMs < idleMs) {
        ok.push({ sessionId, ageMin: Math.floor(ageMs / 60000), reason: 'too_young' });
        continue;
      }

      // Sesiunea e suficient de batrana — verificam memoria pe TOATE scope-urile
      // (root + fiecare client). Bug-fix F2: anterior verificam doar root, deci
      // sesiunile cu client activ erau clasificate fals abandonate.
      const mem = readLatestMemoryContentAcrossScopes();
      const memTouchedRecently = mem && (now - mem.mtimeMs) < idleMs;
      const memClosed = mem && isClosed(mem.content);

      if (memTouchedRecently || memClosed) {
        ok.push({
          sessionId,
          ageMin: Math.floor(ageMs / 60000),
          reason: memClosed ? 'closed' : 'recently_active',
          scope: mem?.scope || 'root',
        });
        continue;
      }

      // Abandonata — extragem open threads ca recovery hint
      const threads = mem ? extractOpenThreads(mem.content) : [];
      abandoned.push({
        sessionId,
        ageMin: Math.floor(ageMs / 60000),
        memDate: mem?.date || null,
        memScope: mem?.scope || 'root',
        openThreads: threads.slice(0, 5),
      });

      // Cleanup marker-ul abandonat (skip in dry-run mode)
      if (!opts.dryRun) {
        try { unlinkSync(path); } catch { /* ignore */ }
      }
    } catch (e) {
      // Marker corupt — sterge (skip in dry-run mode)
      if (!opts.dryRun) {
        try { unlinkSync(path); } catch { /* ignore */ }
      }
    }
  }

  const verdict = abandoned.length > 0 ? 'TIMEOUT_DETECTED' : 'ALL_ACTIVE';
  const entry = {
    detected_at: new Date().toISOString(),
    idle_threshold_hours: opts.hours,
    markers_scanned: markers.length,
    abandoned: abandoned.map(a => ({ sessionId: a.sessionId, ageMin: a.ageMin, memDate: a.memDate })),
    ok: ok.length,
    verdict,
  };

  if (!opts.dryRun) {
    appendNdjson(TIMEOUT_LOG, entry);

    // Daca am detectat sesiuni abandonate, scriem un recovery file timestampat (per batch).
    // Hook-ul UserPromptSubmit aduna toate fisierele neconsumate la urmatoarea sesiune.
    // Per-batch evita race-conditions cand mai multe instante de detector ruleaza concurent.
    if (abandoned.length > 0) {
      ensureDir(RECOVERY_DIR);
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const recoveryFile = join(RECOVERY_DIR, `${ts}.json`);
      writeFileSync(recoveryFile, JSON.stringify({
        detected_at: new Date().toISOString(),
        abandoned_sessions: abandoned,
        consumed: false,
      }, null, 2));
    }

    // F5/F10 fix: prune old session-state markers (>30 days) and consumed
    // recovery files (>7 days). Detector runs every 15 min via cron, so this
    // keeps disk bounded without a separate cleanup job.
    // SCA-5 fix (2026-05-10): also prune cron/logs/ (>14 days). Cron writes
    // ~96 logs/day across all jobs; without retention these grow unbounded.
    const ssPrune = pruneDirByAge(STATE_DIR, 30);
    const recPrune = pruneDirByAge(RECOVERY_DIR, 7);
    const cronLogsDir = join(ROBOS_ROOT, 'cron', 'logs');
    const cronPrune = pruneDirByAge(cronLogsDir, 14, {
      predicate: (name) => name.endsWith('.log'),
    });
    if (!opts.quiet && (ssPrune.removed > 0 || recPrune.removed > 0 || cronPrune.removed > 0)) {
      console.log(`[session-timeout] prune: session-state removed=${ssPrune.removed}, recovery removed=${recPrune.removed}, cron-logs removed=${cronPrune.removed}`);
    }
  }

  if (!opts.quiet) {
    console.log(`[session-timeout] Scanat ${markers.length} session markers (idle threshold: ${opts.hours}h).`);
    console.log(`  OK:        ${ok.length}`);
    console.log(`  Abandoned: ${abandoned.length}`);
    if (abandoned.length > 0) {
      for (const a of abandoned) {
        console.log(`    - ${a.sessionId} (varsta: ${a.ageMin} min, memorie: ${a.memDate || 'none'})`);
        for (const t of a.openThreads.slice(0, 2)) {
          console.log(`        > ${t.slice(0, 100)}${t.length > 100 ? '...' : ''}`);
        }
      }
    }
    console.log(`  Verdict: ${verdict}`);
    console.log(`  Log: ${TIMEOUT_LOG}`);
    if (abandoned.length > 0) console.log(`  Recovery file: ${RECOVERY_DIR}/<timestamp>.json`);
  }

  process.exit(abandoned.length > 0 ? 1 : 0);
}

main().catch(e => {
  console.error(`[session-timeout] eroare: ${e.message}`);
  process.exit(2);
});
