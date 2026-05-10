#!/usr/bin/env node
/**
 * smoke-doctor-coverage.js — Pin UX-6 (`robos.js --doctor` covers expected scope).
 *
 * The `--doctor` flag is the user-facing single-command health check ("ceva
 * e stricat — ce?"). It must check at minimum:
 *   - Required files (VERSION, .env, _index.json, robos.db, settings.json)
 *   - Hook scripts presence (5 hooks)
 *   - Recent hook errors (data/hook-errors.ndjson)
 *   - Smoke tests (smoke-all --quick run)
 *   - Lint portability (BLOCK count)
 *
 * If any of these regresses (someone removes a check during refactor),
 * `--doctor` would silently mislead the user into thinking the system is
 * healthy when it isn't.
 *
 * Strategy:
 *   1. Source check on robos.js commandDoctor — ensure each expected check
 *      block is present.
 *   2. Live spawn `node scripts/robos.js --doctor` — verify output contains
 *      the expected section markers AND exits with the right code.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const ROBOS_ROOT = join(dirname(__filename), '..');
const ROBOS_JS = join(ROBOS_ROOT, 'scripts', 'robos.js');

let pass = 0;
let fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`); }
}

// --- Test 1: source-level expectations ---
console.log('--- robos.js commandDoctor source ---');
{
  const src = readFileSync(ROBOS_JS, 'utf-8');
  check('commandDoctor() function defined',
    /async\s+function\s+commandDoctor\s*\(/.test(src));
  check('--doctor flag wired',
    /FLAGS\.doctor\s*=|args\.has\(['"]--doctor['"]\)/.test(src) &&
      /FLAGS\.doctor\b/.test(src));

  // Required-file checks — each path must appear in the doctor function.
  const expectedFiles = [
    'VERSION',
    '.env',
    '_index.json',
    'robos.db',
    'settings.json',
  ];
  // Find the doctor function body (rough — between `async function commandDoctor` and the next top-level function)
  const docMatch = src.match(/async\s+function\s+commandDoctor[\s\S]+?(?=\n(?:async\s+)?function\s+\w+|\nasync\s+function\s+main)/);
  const docBody = docMatch ? docMatch[0] : '';
  for (const f of expectedFiles) {
    check(`doctor checks ${f}`, docBody.includes(f),
      `expected check missing — refactor may have dropped it`);
  }

  // Hook scripts checked
  const hookScripts = [
    'hook-user-prompt.js',
    'hook-post-tool.js',
    'checkpoint-reminder.js',
    'activity-capture.js',
    'note-candidates.js',
  ];
  for (const h of hookScripts) {
    check(`doctor checks hook ${h}`, docBody.includes(h));
  }

  check('doctor inspects hook-errors.ndjson',
    /hook-errors\.ndjson/.test(docBody),
    'recent error surfacing dropped');
  check('doctor runs smoke-all',
    /smoke-all/.test(docBody) && /execSync|spawnSync/.test(docBody));
  check('doctor runs lint-portability',
    /lint-portability/.test(docBody));
}

// --- Test 2: live invocation ---
console.log('\n--- node scripts/robos.js --doctor ---');
if (process.env.ROBOS_INSIDE_DOCTOR === '1') {
  // Recursion guard: when smoke-all is run BY commandDoctor, this smoke gets
  // invoked too. Spawning doctor again here would loop. The source checks
  // above already covered the structural invariants; skip the live spawn.
  console.log('  SKIP  live invocation skipped (ROBOS_INSIDE_DOCTOR=1)');
} else {
  const r = spawnSync(process.execPath, [ROBOS_JS, '--doctor'], {
    encoding: 'utf-8', shell: false, cwd: ROBOS_ROOT,
    timeout: 60_000, // smoke-all --quick + lint = a few seconds
  });

  const out = (r.stdout || '') + (r.stderr || '');
  check('doctor command produces output', out.trim().length > 0,
    'no output — command may have crashed silently');
  check('doctor banner present',
    /robOS doctor/.test(out));
  check('doctor checks VERSION file', /\[OK\].*VERSION|\[FAIL\].*VERSION/.test(out));
  check('doctor checks .env', /\[OK\].*\.env|\[FAIL\].*\.env/.test(out));
  check('doctor reports smoke results',
    /Smoke tests:/.test(out) || /smoke-all/.test(out),
    'smoke section banner missing');
  check('doctor reports lint-portability result',
    /lint-portability/.test(out));
  check('doctor prints final verdict',
    /(Toate verificarile au trecut|probleme detectate)/.test(out),
    'expected final summary line');

  // Exit code: 0 if all healthy, non-zero if issues. We can't assume which
  // is correct (depends on host state), but the exit must be deterministic
  // (not a crash code like null/137).
  check('doctor exits with deterministic code',
    r.status === 0 || (typeof r.status === 'number' && r.status > 0),
    `exit ${r.status}, error ${r.error?.message}`);
} // end of else branch (ROBOS_INSIDE_DOCTOR guard)

console.log('\n=========================');
console.log(`PASSED: ${pass}`);
console.log(`FAILED: ${fail}`);
console.log('=========================');
process.exit(fail > 0 ? 1 : 0);
