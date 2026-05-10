#!/usr/bin/env node
/**
 * smoke-fresh-install.js — Pin UX-1 (single-command setup works on a fresh extract).
 *
 * Simulates the student experience: extracts the tarball-equivalent set of
 * files (everything `git ls-files` reports — exactly what build-base-tarball
 * packages) into a tmp dir, then runs `node scripts/setup.js --skip-license-bind`
 * and asserts the system reaches a usable state.
 *
 * SLOW (30-90s): runs full `npm install` + `astro build` + `init-db`. Mark in
 * scripts/smoke-all.js SLOW_TESTS so `--quick` skips it. Run before each release.
 *
 * Strategy:
 *   1. Snapshot tracked files (git ls-files) → copy each to fresh TMP_DIR
 *   2. Run setup.js --skip-license-bind in TMP_DIR
 *   3. Assert artifacts: .env, data/robos.db, centre/dist/, skills/_index.json,
 *      centre/node_modules/, decision-journal.md
 *   4. Cleanup TMP_DIR
 *
 * Network: needs internet ONLY if npm cache is cold. Subsequent runs (cache warm)
 * are offline-capable for the install step.
 *
 * Skip conditions: explicit --skip env var, or git command unavailable.
 *
 * Exit: 0 green, 1 fail.
 */

import {
  existsSync, mkdirSync, rmSync, copyFileSync, statSync, readFileSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { performance } from 'node:perf_hooks';

const __filename = fileURLToPath(import.meta.url);
const ROBOS_ROOT = join(dirname(__filename), '..');

let pass = 0;
let fail = 0;

function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`); }
}

if (process.env.ROBOS_SKIP_FRESH_INSTALL === '1') {
  console.log('SKIP smoke-fresh-install (ROBOS_SKIP_FRESH_INSTALL=1)');
  process.exit(0);
}

console.log('--- fresh-install (full setup, slow) ---');
console.log('');

const t0 = performance.now();

// Step 1: enumerate tracked files via git
console.log(' [1/4] Enumerating tracked files (git ls-files)...');
const ls = spawnSync('git', ['ls-files', '-z'], {
  cwd: ROBOS_ROOT,
  encoding: 'buffer',
  shell: false,
});
if (ls.status !== 0) {
  console.error('  FAIL  git ls-files exited', ls.status, ':', ls.stderr?.toString());
  process.exit(1);
}
const trackedFiles = ls.stdout.toString('utf-8').split('\0').filter(Boolean);
console.log(`        ${trackedFiles.length} files`);

// Step 2: copy to TMP_DIR
const TMP_DIR = join(tmpdir(), `robos-fresh-${process.pid}-${Date.now()}`);
console.log(` [2/4] Copying to ${TMP_DIR}...`);

let copyErrors = 0;
for (const rel of trackedFiles) {
  const src = join(ROBOS_ROOT, rel);
  const dst = join(TMP_DIR, rel);
  if (!existsSync(src)) { copyErrors++; continue; }
  try {
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(src, dst);
  } catch (e) {
    copyErrors++;
    if (copyErrors <= 3) console.error('  cp error:', rel, e.message);
  }
}
check(`tracked files copied (${trackedFiles.length - copyErrors}/${trackedFiles.length})`, copyErrors === 0,
  `${copyErrors} copy errors`);

if (copyErrors > 0) {
  console.error('  FAIL  copy phase incomplete; aborting');
  rmSync(TMP_DIR, { recursive: true, force: true });
  process.exit(1);
}

// Step 3: run setup.js --skip-license-bind
console.log(' [3/4] Running setup.js --skip-license-bind (this is the slow part)...');
const setupResult = spawnSync(
  process.execPath,
  [join(TMP_DIR, 'scripts', 'setup.js'), '--skip-license-bind'],
  {
    cwd: TMP_DIR,
    encoding: 'utf-8',
    shell: false,
    // Inherit stdio so npm/astro progress is visible (and any failure surfaces)
    stdio: ['ignore', 'inherit', 'inherit'],
  }
);

const setupExit = setupResult.status;
check('setup.js --skip-license-bind exits 0', setupExit === 0, `exit ${setupExit}`);

if (setupExit !== 0) {
  console.error('\n  setup failed; investigate stdout/stderr above');
  rmSync(TMP_DIR, { recursive: true, force: true });
  process.exit(1);
}

// Step 4: assert artifacts
console.log(' [4/4] Asserting artifacts...');

const ARTIFACTS = [
  '.env',
  'data/robos.db',
  'centre/dist/index.html',        // Astro static build entry — proves build succeeded
  'centre/node_modules',           // proves npm install succeeded
  'skills/_index.json',
  'context/decision-journal.md',
  'context/memory',
  'projects',
  'cron/jobs',
];

for (const rel of ARTIFACTS) {
  const path = join(TMP_DIR, rel);
  check(`artifact exists: ${rel}`, existsSync(path));
}

// .env content sanity
const envPath = join(TMP_DIR, '.env');
if (existsSync(envPath)) {
  const env = readFileSync(envPath, 'utf-8');
  check('.env has dashboard token (auto-generated)', /^ROBOS_DASHBOARD_TOKEN=[a-f0-9]{64}/m.test(env));
  check('.env preserves PORT default', /^PORT=3001\b/m.test(env));
}

// _index.json sanity
const indexPath = join(TMP_DIR, 'skills', '_index.json');
if (existsSync(indexPath)) {
  let idx;
  try { idx = JSON.parse(readFileSync(indexPath, 'utf-8')); } catch {}
  check('skills/_index.json parses', !!idx && Array.isArray(idx.skills));
  check('skills/_index.json has skills', idx?.skills?.length > 0, `count=${idx?.skills?.length}`);
}

// Cleanup
rmSync(TMP_DIR, { recursive: true, force: true });

const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
console.log('');
console.log('=========================');
console.log(`PASSED: ${pass}`);
console.log(`FAILED: ${fail}`);
console.log(`Elapsed: ${elapsed}s`);
console.log('=========================');
process.exit(fail > 0 ? 1 : 0);
