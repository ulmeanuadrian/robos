#!/usr/bin/env node
/**
 * smoke-hook-missing-deps.js — Pin: hook-uri trebuie sa supravietuiasca
 * gracef daca `centre/node_modules/` lipseste (student a sarit Pasul 4 din
 * install guide si a deschis `claude` direct fara `node scripts/robos.js`).
 *
 * Bug istoric (2026-05-13, v3.1.3): `note-candidates.js` avea static import
 *   `import { getDb, closeDb } from '../centre/lib/db.js';`
 * Daca `better-sqlite3` lipsea din `centre/node_modules/`, ESM module loader
 * arunca ERR_MODULE_NOT_FOUND la load time — INAINTE de orice try/catch din
 * main(). Hook-ul Stop afisa eroare 30-line la finalul fiecarui turn.
 *
 * Sibling `hook-user-prompt.js` folosea deja dynamic import (`await import`)
 * cu try/catch — gracef. Asta e pattern-ul corect pentru hook-uri.
 *
 * Strategy:
 *   1. LINT: niciun hook script (cele 5 din .claude/settings.json + cele
 *      apelate tranzitiv) sa NU aiba `^import ... from '../centre/lib/db'`
 *      la top level. Folosesc dynamic import in interior.
 *   2. FUNCTIONAL: temporar redenumesc `centre/node_modules/better-sqlite3`
 *      ca sa simulez student fresh, rulez fiecare hook, astept exit 0.
 *      Restoreaza la final indiferent de rezultat.
 */

import { readFileSync, existsSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const ROBOS_ROOT = join(dirname(__filename), '..');

let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`); }
}

// Hook scripts declared in .claude/settings.json — must survive missing deps
const HOOK_SCRIPTS = [
  'scripts/hook-user-prompt.js',
  'scripts/hook-post-tool.js',
  'scripts/checkpoint-reminder.js',
  'scripts/activity-capture.js',
  'scripts/note-candidates.js',
];

// ---------------------------------------------------------------------------
// 1. LINT — no static import of centre/lib in hook scripts
// ---------------------------------------------------------------------------
console.log('--- Hook missing-deps smoke ---\n');
console.log('--- Lint: no static import of centre/lib in hook scripts ---');

const STATIC_IMPORT_PATTERN = /^import\s+[^;]*from\s+['"][^'"]*centre\/lib[^'"]*['"]/m;

for (const rel of HOOK_SCRIPTS) {
  const abs = join(ROBOS_ROOT, rel);
  if (!existsSync(abs)) {
    check(`${rel} exists`, false, 'file not found');
    continue;
  }
  const src = readFileSync(abs, 'utf-8');
  const hasStaticImport = STATIC_IMPORT_PATTERN.test(src);
  check(
    `${rel} has no static import of centre/lib`,
    !hasStaticImport,
    hasStaticImport
      ? 'found static import — convert to dynamic `await import()` inside try/catch'
      : null,
  );
}

// ---------------------------------------------------------------------------
// 2. FUNCTIONAL — simulate missing better-sqlite3, all hooks must exit 0
// ---------------------------------------------------------------------------
console.log('\n--- Functional: simulate missing better-sqlite3 ---');

const PKG = join(ROBOS_ROOT, 'centre', 'node_modules', 'better-sqlite3');
const HIDDEN = join(ROBOS_ROOT, 'centre', 'node_modules', 'better-sqlite3.smoke-hidden');

if (!existsSync(PKG)) {
  console.log('  SKIP  better-sqlite3 not installed on this machine — functional sim n/a');
} else {
  // Hide better-sqlite3 by renaming
  try {
    renameSync(PKG, HIDDEN);
  } catch (e) {
    check('rename better-sqlite3 to simulate missing', false, e.message);
    process.exit(1);
  }

  const MOCK_PAYLOAD = JSON.stringify({
    session_id: 'smoke-hook-missing-deps',
    prompt: 'test prompt',
    cwd: ROBOS_ROOT,
    tool_name: 'Read',
    tool_input: { file_path: 'README.md' },
    tool_response: { content: 'fixture' },
  });

  try {
    for (const rel of HOOK_SCRIPTS) {
      const abs = join(ROBOS_ROOT, rel);
      const r = spawnSync(process.execPath, [abs], {
        input: MOCK_PAYLOAD,
        encoding: 'utf-8',
        cwd: ROBOS_ROOT,
        timeout: 10_000,
      });
      const stderr = (r.stderr || '').toString();
      const hasCantFind = /Cannot find package|ERR_MODULE_NOT_FOUND/i.test(stderr);
      check(
        `${rel} exits 0 with deps missing`,
        r.status === 0 && !hasCantFind,
        r.status !== 0
          ? `exit ${r.status}, stderr: ${stderr.slice(0, 160)}`
          : hasCantFind
            ? `ERR_MODULE_NOT_FOUND leaked: ${stderr.slice(0, 200)}`
            : null,
      );
    }
  } finally {
    // Restore — MUST run even on test failure
    try {
      renameSync(HIDDEN, PKG);
    } catch (e) {
      console.log(`  WARN  could not restore better-sqlite3 — manual fix: rename ${HIDDEN} to ${PKG}`);
    }
  }
}

// ---------------------------------------------------------------------------
console.log('\n=========================');
console.log(`PASSED: ${pass}`);
console.log(`FAILED: ${fail}`);
console.log('=========================');
process.exit(fail > 0 ? 1 : 0);
