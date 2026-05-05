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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROBOS_ROOT = join(__dirname, '..');
const MEMORY_DIR = join(ROBOS_ROOT, 'context', 'memory');
const DATA_DIR = join(ROBOS_ROOT, 'data');
const LOG_FILE = join(DATA_DIR, 'startup-audit.log');

const CLOSING_PATTERN = /Session:\s*\d+\s*deliverables/i;

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
function getRecentMemoryFiles(days) {
  if (!existsSync(MEMORY_DIR)) return [];

  const cutoff = daysAgoISO(days);
  return readdirSync(MEMORY_DIR)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .filter(f => f.replace(/\.md$/, '') >= cutoff)
    .sort();
}

/**
 * Analizeaza un singur fisier de memorie. Returneaza statusul.
 */
function analyzeMemoryFile(filename) {
  const path = join(MEMORY_DIR, filename);
  const content = readFileSync(path, 'utf-8');
  const date = filename.replace(/\.md$/, '');

  const closed = CLOSING_PATTERN.test(content);
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

  let files;
  try {
    files = getRecentMemoryFiles(opts.days);
  } catch (e) {
    console.error(`[audit-startup] eroare la citirea ${MEMORY_DIR}: ${e.message}`);
    process.exit(2);
  }

  if (files.length === 0) {
    if (!opts.quiet) console.log(`[audit-startup] Niciun fisier de memorie in ultimele ${opts.days} zile.`);
    writeAuditLog({
      audit_at: new Date().toISOString(),
      window_days: opts.days,
      files_audited: 0,
      abandoned: [],
      ok: [],
      verdict: 'NO_DATA',
    });
    process.exit(0);
  }

  const ok = [];
  const abandoned = [];

  for (const file of files) {
    try {
      const result = analyzeMemoryFile(file);

      // Sesiunea de azi nu se considera abandonata daca e in curs (poate inca nu s-a inchis)
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

  const verdict = abandoned.length > 0 ? 'ABANDONED_FOUND' : 'ALL_CLEAN';
  const entry = {
    audit_at: new Date().toISOString(),
    window_days: opts.days,
    files_audited: files.length,
    abandoned,
    ok: ok.map(o => ({ date: o.date, sessions: o.sessions, note: o.note || null })),
    verdict,
  };

  writeAuditLog(entry);

  if (!opts.quiet) {
    console.log(`[audit-startup] Auditat ${files.length} fisiere din ultimele ${opts.days} zile.`);
    console.log(`  OK:        ${ok.length}`);
    console.log(`  Abandoned: ${abandoned.length}`);
    if (abandoned.length > 0) {
      console.log(`\n  Sesiuni abandonate (fara pattern "Session: N deliverables"):`);
      for (const a of abandoned) {
        const threads = a.openThreadCount ? `, ${a.openThreadCount} open threads` : '';
        console.log(`    - ${a.date}${threads}`);
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

  process.exit(abandoned.length > 0 ? 1 : 0);
}

main().catch(e => {
  console.error(`[audit-startup] eroare neasteptata: ${e.message}`);
  process.exit(2);
});
