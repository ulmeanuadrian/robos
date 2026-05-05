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

import { readdirSync, readFileSync, writeFileSync, statSync, existsSync, appendFileSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROBOS_ROOT = join(__dirname, '..');
const STATE_DIR = join(ROBOS_ROOT, 'data', 'session-state');
const MEMORY_DIR = join(ROBOS_ROOT, 'context', 'memory');
const DATA_DIR = join(ROBOS_ROOT, 'data');
const TIMEOUT_LOG = join(DATA_DIR, 'session-timeout.log');
const RECOVERY_FILE = join(DATA_DIR, 'session-recovery.json');

const CLOSING_PATTERN = /Session:\s*\d+\s*deliverables/i;

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { hours: 2, quiet: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--hours' && args[i + 1]) {
      opts.hours = parseFloat(args[i + 1]) || 2;
      i++;
    } else if (args[i] === '--quiet' || args[i] === '-q') {
      opts.quiet = true;
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

function readLatestMemoryContent() {
  if (!existsSync(MEMORY_DIR)) return null;
  const files = readdirSync(MEMORY_DIR)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .sort()
    .reverse();
  if (files.length === 0) return null;
  const path = join(MEMORY_DIR, files[0]);
  return {
    path,
    date: files[0].replace(/\.md$/, ''),
    content: readFileSync(path, 'utf-8'),
    mtimeMs: statSync(path).mtimeMs,
  };
}

function extractOpenThreads(content) {
  if (!content) return [];
  const matches = [...content.matchAll(/###\s+Open\s+Threads\s*\n([\s\S]*?)(?=\n###|\n##|$)/gi)];
  if (matches.length === 0) return [];
  const lastSection = matches[matches.length - 1][1];
  return lastSection
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('-') || l.startsWith('*'))
    .map(l => l.replace(/^[-*]\s+/, ''));
}

async function main() {
  const opts = parseArgs();
  const now = Date.now();
  const idleMs = opts.hours * 3600 * 1000;

  ensureDir(STATE_DIR);
  ensureDir(DATA_DIR);

  const markers = existsSync(STATE_DIR)
    ? readdirSync(STATE_DIR).filter(f => /^[^-]+\.json$/.test(f) && !f.endsWith('-checkpoint.json'))
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

      // Sesiunea e suficient de batrana — verificam memoria
      const mem = readLatestMemoryContent();
      const memTouchedRecently = mem && (now - mem.mtimeMs) < idleMs;
      const memClosed = mem && CLOSING_PATTERN.test(mem.content);

      if (memTouchedRecently || memClosed) {
        ok.push({ sessionId, ageMin: Math.floor(ageMs / 60000), reason: memClosed ? 'closed' : 'recently_active' });
        continue;
      }

      // Abandonata — extragem open threads ca recovery hint
      const threads = mem ? extractOpenThreads(mem.content) : [];
      abandoned.push({
        sessionId,
        ageMin: Math.floor(ageMs / 60000),
        memDate: mem?.date || null,
        openThreads: threads.slice(0, 5),
      });

      // Cleanup marker-ul abandonat
      try { unlinkSync(path); } catch { /* ignore */ }
    } catch (e) {
      // Marker corupt — sterge
      try { unlinkSync(path); } catch { /* ignore */ }
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

  appendFileSync(TIMEOUT_LOG, JSON.stringify(entry) + '\n', 'utf-8');

  // Daca am detectat sesiuni abandonate, scriem un recovery file pentru sesiunea urmatoare
  if (abandoned.length > 0) {
    writeFileSync(RECOVERY_FILE, JSON.stringify({
      detected_at: new Date().toISOString(),
      abandoned_sessions: abandoned,
      consumed: false,
    }, null, 2));
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
    if (abandoned.length > 0) console.log(`  Recovery file: ${RECOVERY_FILE}`);
  }

  process.exit(abandoned.length > 0 ? 1 : 0);
}

main().catch(e => {
  console.error(`[session-timeout] eroare: ${e.message}`);
  process.exit(2);
});
