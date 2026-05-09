#!/usr/bin/env node
/**
 * audit-startup.js
 *
 * Audit retroactiv al sesiunilor robOS. Verifica daca fiecare fisier de memorie
 * din ultimele 7 zile s-a inchis curat (cu pattern-ul "Session: N deliverables, M decisions").
 *
 * Output:
 *  - Append intr-un raport NDJSON la `data/startup-audit.log` (o linie per rulare)
 *  - Stdout: rezumat scurt + cod de exit
 *
 * Cod de exit:
 *  0 = toate sesiunile recente s-au inchis curat (sau nu sunt sesiuni de auditat)
 *  1 = cel putin o sesiune abandonata in ultimele 7 zile
 *  2 = eroare interna
 *
 * Folosire:
 *  node scripts/audit-startup.js          # full audit, last 7 days
 *  node scripts/audit-startup.js --days 3 # last 3 days
 *  node scripts/audit-startup.js --quiet  # suppress stdout, just write log
 *
 * Apelat de:
 *  - hook-user-prompt.js (pe primul prompt al fiecarei sesiuni — non-fatal)
 *  - cron/jobs/audit-startup.json (optional, pentru raport zilnic)
 *  - manual (debugging: `node scripts/audit-startup.js`)
 */

import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { appendNdjson } from './lib/ndjson-log.js';
import { isClosed } from './lib/memory-format.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROBOS_ROOT = join(__dirname, '..');
const ROOT_MEMORY_DIR = join(ROBOS_ROOT, 'context', 'memory');
const CLIENTS_DIR = join(ROBOS_ROOT, 'clients');
const DATA_DIR = join(ROBOS_ROOT, 'data');
const LOG_FILE = join(DATA_DIR, 'startup-audit.log');

/**
 * Returns array of { scope: 'root' | 'client:slug', dir: string } for every
 * memory directory that exists on disk: root + each clients/{slug}/context/memory/.
 */
function getMemoryScopes() {
  const scopes = [];
  if (existsSync(ROOT_MEMORY_DIR)) {
    scopes.push({ scope: 'root', dir: ROOT_MEMORY_DIR });
  }
  if (existsSync(CLIENTS_DIR)) {
    try {
      const entries = readdirSync(CLIENTS_DIR, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        if (e.name.startsWith('.') || e.name.startsWith('_')) continue;
        const memDir = join(CLIENTS_DIR, e.name, 'context', 'memory');
        if (existsSync(memDir)) scopes.push({ scope: `client:${e.name}`, dir: memDir });
      }
    } catch { /* ignore */ }
  }
  return scopes;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { days: 7, quiet: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--days' && args[i + 1]) {
      opts.days = parseInt(args[i + 1], 10) || 7;
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

function daysAgoISO(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Returneaza array de fisiere de memorie din ultimele N zile, sortate cronologic.
 */
function getRecentMemoryFiles(memDir, days) {
  if (!existsSync(memDir)) return [];

  const cutoff = daysAgoISO(days);
  return readdirSync(memDir)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .filter(f => f.replace(/\.md$/, '') >= cutoff)
    .sort();
}

/**
 * Analizeaza un singur fisier de memorie. Returneaza statusul.
 */
function analyzeMemoryFile(memDir, filename) {
  const path = join(memDir, filename);
  const content = readFileSync(path, 'utf-8');
  const date = filename.replace(/\.md$/, '');

  const closed = isClosed(content);
  const sessionCount = (content.match(/^##\s+Session\s+\d+/gm) || []).length;

  // Extract open threads from LAST Open Threads section
  const threadMatches = [...content.matchAll(/###\s+Open\s+Threads\s*\n([\s\S]*?)(?=\n###|\n##|$)/gi)];
  let openThreads = [];
  if (threadMatches.length > 0) {
    const lastSection = threadMatches[threadMatches.length - 1][1];
    openThreads = lastSection
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.startsWith('-') || l.startsWith('*'))
      .map(l => l.replace(/^[-*]\s+/, ''));
  }

  return {
    date,
    sessions: sessionCount,
    closed,
    openThreadCount: openThreads.length,
    openThreads: openThreads.slice(0, 3), // sample only
    sizeBytes: content.length,
  };
}

function writeAuditLog(entry) {
  appendNdjson(LOG_FILE, entry);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  const opts = parseArgs();
  const today = todayISO();

  const scopes = getMemoryScopes();
  if (scopes.length === 0) {
    if (!opts.quiet) console.log(`[audit-startup] Niciun director de memorie pe disk.`);
    writeAuditLog({
      audit_at: new Date().toISOString(),
      window_days: opts.days,
      scopes: [],
      total_files_audited: 0,
      total_abandoned: 0,
      verdict: 'NO_DATA',
    });
    process.exit(0);
  }

  // Audit each scope independently. Aggregated verdict = ABANDONED_FOUND if any.
  const perScope = [];
  let totalFiles = 0;
  let totalAbandoned = 0;

  for (const { scope, dir } of scopes) {
    let files;
    try {
      files = getRecentMemoryFiles(dir, opts.days);
    } catch (e) {
      perScope.push({ scope, error: e.message, files_audited: 0, abandoned: [], ok: [] });
      continue;
    }

    const ok = [];
    const abandoned = [];

    for (const file of files) {
      try {
        const result = analyzeMemoryFile(dir, file);

        // Sesiunea de azi nu se considera abandonata daca e in curs.
        if (result.date === today) {
          ok.push({ ...result, note: 'in_progress' });
          continue;
        }

        if (result.closed) {
          ok.push(result);
        } else {
          abandoned.push(result);
        }
      } catch (e) {
        abandoned.push({ date: file.replace(/\.md$/, ''), error: e.message });
      }
    }

    perScope.push({
      scope,
      files_audited: files.length,
      abandoned,
      ok: ok.map(o => ({ date: o.date, sessions: o.sessions, note: o.note || null })),
    });
    totalFiles += files.length;
    totalAbandoned += abandoned.length;
  }

  const verdict = totalAbandoned > 0 ? 'ABANDONED_FOUND' : (totalFiles > 0 ? 'ALL_CLEAN' : 'NO_DATA');

  // Flatten abandoned for backwards-compat consumers (hook-user-prompt reads
  // entry.abandoned). Each item gets its scope tag.
  const flatAbandoned = perScope.flatMap(s =>
    (s.abandoned || []).map(a => ({ ...a, scope: s.scope }))
  );

  const entry = {
    audit_at: new Date().toISOString(),
    window_days: opts.days,
    scopes: perScope.map(s => ({
      scope: s.scope,
      files_audited: s.files_audited,
      abandoned_count: (s.abandoned || []).length,
      error: s.error || null,
    })),
    total_files_audited: totalFiles,
    total_abandoned: totalAbandoned,
    abandoned: flatAbandoned,
    verdict,
  };

  writeAuditLog(entry);

  if (!opts.quiet) {
    console.log(`[audit-startup] Auditat ${totalFiles} fisiere din ${perScope.length} scope(uri) (window ${opts.days} zile).`);
    for (const s of perScope) {
      const ab = (s.abandoned || []).length;
      const fa = s.files_audited;
      console.log(`  ${s.scope.padEnd(30)} files=${fa}  abandoned=${ab}`);
    }
    if (totalAbandoned > 0) {
      console.log(`\n  Sesiuni abandonate (fara pattern "Session: N deliverables"):`);
      for (const a of flatAbandoned) {
        const threads = a.openThreadCount ? `, ${a.openThreadCount} open threads` : '';
        console.log(`    [${a.scope}] - ${a.date}${threads}`);
        if (a.openThreads?.length) {
          for (const t of a.openThreads.slice(0, 2)) {
            console.log(`        > ${t.slice(0, 100)}${t.length > 100 ? '...' : ''}`);
          }
        }
      }
    }
    console.log(`\n  Verdict: ${verdict}`);
    console.log(`  Log: ${LOG_FILE}`);
  }

  process.exit(totalAbandoned > 0 ? 1 : 0);
}

main().catch(e => {
  console.error(`[audit-startup] eroare neasteptata: ${e.message}`);
  process.exit(2);
});
