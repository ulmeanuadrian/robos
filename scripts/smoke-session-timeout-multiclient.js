#!/usr/bin/env node
// scripts/smoke-session-timeout-multiclient.js
//
// F2 fix verification: session-timeout-detector trebuie sa vada memoria scrisa
// in clients/{slug}/context/memory/ — nu doar in root.
//
// Pre-fix bug: detector clasifica fals abandonata orice sesiune cu client activ
// pentru ca ignora memoria din scope-ul clientului.
//
// Strategy:
//   1. Creeaza un client de test (zz-smoke-timeout)
//   2. Scrie memoria recenta in clients/{slug}/context/memory/YYYY-MM-DD.md
//      (mtime = acum)
//   3. Creeaza un session marker batran (started_at = -3h, deci > idle threshold 2h)
//   4. Ruleaza session-timeout-detector --dry-run
//   5. Asserteaza: sesiunea e marcata 'OK' (recently_active), NU 'abandoned'
//   6. Cleanup: sterge clientul si marker-ul
//
// Daca testul fail-uieste cu client memory ignorat → bug-ul F2 inca exista.
//
// Cross-platform: pure Node fs ops, niciun shell call.

import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync, unlinkSync, statSync, utimesSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROBOS_ROOT = join(__dirname, '..');

const TEST_CLIENT_SLUG = 'zz-smoke-timeout';
const TEST_CLIENT_DIR = join(ROBOS_ROOT, 'clients', TEST_CLIENT_SLUG);
const TEST_MEM_DIR = join(TEST_CLIENT_DIR, 'context', 'memory');
const TEST_BRAND_DIR = join(TEST_CLIENT_DIR, 'brand');
const STATE_DIR = join(ROBOS_ROOT, 'data', 'session-state');
const TEST_SESSION_ID = `smoke-timeout-${process.pid}-${Date.now()}`;
const TEST_SESSION_MARKER = join(STATE_DIR, `${TEST_SESSION_ID}.json`);

let pass = 0, fail = 0;

function assert(cond, msg) {
  if (cond) { pass++; console.log(`  PASS  ${msg}`); }
  else { fail++; console.log(`  FAIL  ${msg}`); }
}

function ensureDir(d) { if (!existsSync(d)) mkdirSync(d, { recursive: true }); }

function todayISO() { return new Date().toISOString().slice(0, 10); }

function setup() {
  // 1. Create test client folder structure
  ensureDir(TEST_MEM_DIR);
  ensureDir(TEST_BRAND_DIR);

  // 2. Write recent memory file (mtime = now)
  const memPath = join(TEST_MEM_DIR, `${todayISO()}.md`);
  writeFileSync(memPath, [
    `# ${todayISO()}`,
    '',
    '## Session 1',
    '',
    '### Goal',
    'Test recent activity — memoria scrisa acum, sesiunea ar trebui marcata "recently_active".',
    '',
    '### Open Threads',
    '- Smoke testing F2 fix',
  ].join('\n'), 'utf-8');

  // Force mtime to NOW to be sure
  const nowMs = Date.now();
  utimesSync(memPath, nowMs / 1000, nowMs / 1000);

  // 3. Create OLD session marker (3h ago, > 2h idle threshold)
  ensureDir(STATE_DIR);
  const startedAt = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
  writeFileSync(TEST_SESSION_MARKER, JSON.stringify({
    started_at: startedAt,
    sessionId: TEST_SESSION_ID,
  }, null, 2), 'utf-8');
}

function teardown() {
  // Cleanup client folder
  if (existsSync(TEST_CLIENT_DIR)) {
    rmSync(TEST_CLIENT_DIR, { recursive: true, force: true });
  }
  // Cleanup session marker (if not already deleted by detector)
  if (existsSync(TEST_SESSION_MARKER)) {
    try { unlinkSync(TEST_SESSION_MARKER); } catch {}
  }
}

function runDetector() {
  const result = spawnSync(process.execPath, [
    join(ROBOS_ROOT, 'scripts', 'session-timeout-detector.js'),
    '--dry-run',
    '--quiet',
  ], { encoding: 'utf-8', cwd: ROBOS_ROOT });

  return {
    exitCode: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

console.log('--- F2: session-timeout-detector vede memoria per-client ---');
console.log(`  test client slug: ${TEST_CLIENT_SLUG}`);
console.log(`  test session id:  ${TEST_SESSION_ID}`);
console.log('');

try {
  setup();

  // Verify setup actually placed files where we expect
  const memFiles = existsSync(TEST_MEM_DIR);
  assert(memFiles, 'setup: client memory dir exists');
  assert(existsSync(TEST_SESSION_MARKER), 'setup: session marker created');

  // Verify the memory file's mtime is fresh
  const memPath = join(TEST_MEM_DIR, `${todayISO()}.md`);
  const ageMs = Date.now() - statSync(memPath).mtimeMs;
  assert(ageMs < 60000, `setup: memory mtime is fresh (${ageMs}ms ago)`);

  // Verify session marker is suitably aged
  const markerAge = Date.now() - new Date(JSON.parse(readFileSync(TEST_SESSION_MARKER, 'utf-8')).started_at).getTime();
  assert(markerAge > 2 * 3600 * 1000, `setup: marker is older than 2h idle threshold (${Math.round(markerAge/60000)}min)`);

  // Run detector
  const result = runDetector();
  assert(result.exitCode === 0, `detector exits 0 (recently_active, not abandoned). Got: ${result.exitCode}. stderr: ${result.stderr.trim()}`);

  // Marker should still exist (dry-run shouldn't delete)
  assert(existsSync(TEST_SESSION_MARKER), 'dry-run: marker NOT deleted (would have been deleted in real run if classified abandoned)');

  // Now run WITHOUT dry-run — should still classify as recently_active because memory IS fresh in client scope
  const realRun = spawnSync(process.execPath, [
    join(ROBOS_ROOT, 'scripts', 'session-timeout-detector.js'),
    '--quiet',
  ], { encoding: 'utf-8', cwd: ROBOS_ROOT });

  assert(realRun.status === 0, 'real run exits 0 (recently_active classification)');
  assert(existsSync(TEST_SESSION_MARKER), 'real run: marker preserved (recently_active is not deleted)');

} finally {
  teardown();
  // Verify cleanup
  assert(!existsSync(TEST_CLIENT_DIR), 'cleanup: test client folder removed');
  assert(!existsSync(TEST_SESSION_MARKER), 'cleanup: marker removed');
}

console.log('');
console.log('=========================');
console.log(`PASSED: ${pass}`);
console.log(`FAILED: ${fail}`);
console.log('=========================');

process.exit(fail > 0 ? 1 : 0);
