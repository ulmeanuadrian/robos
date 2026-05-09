#!/usr/bin/env node
/**
 * smoke-multiclient.js
 *
 * End-to-end validation for the active-client mechanism.
 *
 * Creates an ephemeral client (zz-smoke-client), runs the full set/clear/list
 * flow through both the lib API and the CLI, asserts path resolution at every
 * stage, then cleans up.
 *
 * Exit codes:
 *   0 = all assertions passed
 *   1 = at least one assertion failed (details on stdout/stderr)
 *
 * Run: node scripts/smoke-multiclient.js
 */

import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import {
  getActiveClient,
  setActiveClient,
  clearActiveClient,
  listClients,
  resolveContextPath,
  getMemoryDir,
  getBrandDir,
  getProjectsDir,
  isValidSlug,
} from './lib/client-context.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROBOS_ROOT = join(__dirname, '..');
const TEST_SLUG = 'zz-smoke-client';
const TEST_NAME = 'Smoke Test Client';
const TEST_DIR = join(ROBOS_ROOT, 'clients', TEST_SLUG);
const STATE_FILE = join(ROBOS_ROOT, 'data', 'active-client.json');
const STATE_BACKUP = join(ROBOS_ROOT, 'data', 'active-client.json.smoke-bak');

let failures = 0;
let passed = 0;
const startedActive = existsSync(STATE_FILE);

function check(label, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function assertEq(label, actual, expected) {
  check(label, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ---------- Setup ----------

function setup() {
  console.log('--- setup ---');

  // Backup existing active-client state so user's real switch is preserved.
  if (existsSync(STATE_FILE)) {
    writeFileSync(STATE_BACKUP, readFileSync(STATE_FILE));
    rmSync(STATE_FILE);
    console.log('  backed up existing active-client.json');
  }

  // Build a minimal client folder by hand (avoids depending on bash on Windows).
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
  mkdirSync(join(TEST_DIR, 'brand'), { recursive: true });
  mkdirSync(join(TEST_DIR, 'context', 'memory'), { recursive: true });
  mkdirSync(join(TEST_DIR, 'projects'), { recursive: true });
  writeFileSync(join(TEST_DIR, 'brand', 'voice.md'), '# Voice — Smoke\n');
  writeFileSync(join(TEST_DIR, 'context', 'USER.md'), `# Profil Client\nNume: ${TEST_NAME}\n`);
  writeFileSync(join(TEST_DIR, 'context', 'learnings.md'), '# Learnings — Smoke\n');
  writeFileSync(join(TEST_DIR, 'CLAUDE.md'), '# Client smoke test\n');
  console.log(`  created ${TEST_DIR}`);
}

// ---------- Tests ----------

function testValidation() {
  console.log('\n--- isValidSlug ---');
  assertEq('valid slug "acme-corp"', isValidSlug('acme-corp'), true);
  assertEq('valid slug "abc"', isValidSlug('abc'), true);
  assertEq('valid slug "a"', isValidSlug('a'), true);
  assertEq('reject "Acme" (uppercase)', isValidSlug('Acme'), false);
  assertEq('reject "acme corp" (space)', isValidSlug('acme corp'), false);
  assertEq('reject "-acme" (leading dash)', isValidSlug('-acme'), false);
  assertEq('reject "acme-" (trailing dash)', isValidSlug('acme-'), false);
  assertEq('reject ""', isValidSlug(''), false);
  assertEq('reject null', isValidSlug(null), false);
}

function testInitialState() {
  console.log('\n--- initial state (no active) ---');
  const active = getActiveClient();
  check('no active client at start', active === null, `got ${JSON.stringify(active)}`);

  const memDir = getMemoryDir();
  assertEq('memory dir = root', memDir, join(ROBOS_ROOT, 'context', 'memory'));

  const brandDir = getBrandDir();
  assertEq('brand dir = root', brandDir, join(ROBOS_ROOT, 'brand'));

  const projDir = getProjectsDir();
  assertEq('projects dir = root', projDir, join(ROBOS_ROOT, 'projects'));

  const resolved = resolveContextPath('brand/voice.md');
  assertEq('resolveContextPath brand/voice.md = root', resolved, join(ROBOS_ROOT, 'brand', 'voice.md'));
}

function testList() {
  console.log('\n--- listClients includes test client ---');
  const clients = listClients();
  const found = clients.find(c => c.slug === TEST_SLUG);
  check('test client visible in list', !!found);
  if (found) {
    assertEq('  name from USER.md', found.name, TEST_NAME);
    assertEq('  has_brand=true', found.has_brand, true);
    assertEq('  has_memory=true', found.has_memory, true);
    assertEq('  has_user_md=true', found.has_user_md, true);
  }
}

function testSetClient() {
  console.log('\n--- setActiveClient ---');
  let result;
  try {
    result = setActiveClient(TEST_SLUG);
  } catch (e) {
    failures++;
    console.error(`  FAIL  setActiveClient threw: ${e.message}`);
    return;
  }
  passed++;
  console.log('  PASS  setActiveClient succeeded');

  assertEq('  result.slug', result.slug, TEST_SLUG);
  assertEq('  result.name', result.name, TEST_NAME);
  check('  result.switched_at present', !!result.switched_at);

  const active = getActiveClient();
  check('  getActiveClient returns the new state', active && active.slug === TEST_SLUG);

  // Path resolution should now route to client.
  const memDir = getMemoryDir();
  assertEq('  memory dir → client', memDir, join(TEST_DIR, 'context', 'memory'));

  const brandDir = getBrandDir();
  assertEq('  brand dir → client', brandDir, join(TEST_DIR, 'brand'));

  const projDir = getProjectsDir();
  assertEq('  projects dir → client', projDir, join(TEST_DIR, 'projects'));

  // resolveContextPath specifically.
  assertEq('  resolveContextPath brand/voice.md → client',
    resolveContextPath('brand/voice.md'),
    join(TEST_DIR, 'brand', 'voice.md'));

  assertEq('  resolveContextPath context/USER.md → client',
    resolveContextPath('context/USER.md'),
    join(TEST_DIR, 'context', 'USER.md'));

  assertEq('  resolveContextPath context/learnings.md → client',
    resolveContextPath('context/learnings.md'),
    join(TEST_DIR, 'context', 'learnings.md'));

  assertEq('  resolveContextPath context/memory/2026-05-08.md → client',
    resolveContextPath('context/memory/2026-05-08.md'),
    join(TEST_DIR, 'context', 'memory', '2026-05-08.md'));

  // SOUL.md and skills/ should remain ROOT even when client active.
  assertEq('  resolveContextPath context/SOUL.md → root',
    resolveContextPath('context/SOUL.md'),
    join(ROBOS_ROOT, 'context', 'SOUL.md'));

  assertEq('  resolveContextPath skills/_index.json → root',
    resolveContextPath('skills/_index.json'),
    join(ROBOS_ROOT, 'skills', '_index.json'));

  assertEq('  resolveContextPath data/robos.db → root',
    resolveContextPath('data/robos.db'),
    join(ROBOS_ROOT, 'data', 'robos.db'));
}

function testInvalidSet() {
  console.log('\n--- setActiveClient invalid ---');
  let threw = false;
  try { setActiveClient('Bogus Slug'); } catch { threw = true; }
  check('rejects invalid slug', threw);

  threw = false;
  try { setActiveClient('does-not-exist-xyz'); } catch { threw = true; }
  check('rejects non-existent client', threw);

  // Active client should still be the test client (unaffected by failed sets).
  const active = getActiveClient();
  check('active client unchanged after failed sets', active && active.slug === TEST_SLUG);
}

function testCli() {
  console.log('\n--- CLI integration ---');
  const cli = `node "${join(ROBOS_ROOT, 'scripts', 'active-client.js')}"`;

  const status = execSync(`${cli} status`, { encoding: 'utf-8' });
  check('CLI status reports active', status.includes(TEST_SLUG), `got: ${status.trim()}`);

  const json = execSync(`${cli} json`, { encoding: 'utf-8' });
  let parsed;
  try { parsed = JSON.parse(json); } catch { parsed = null; }
  check('CLI json output parses', !!parsed);
  if (parsed) {
    check('  json.active.slug matches', parsed.active && parsed.active.slug === TEST_SLUG);
    check('  json.clients includes test slug', Array.isArray(parsed.clients) && parsed.clients.some(c => c.slug === TEST_SLUG));
  }
}

function testClear() {
  console.log('\n--- clearActiveClient ---');
  clearActiveClient();
  check('  state cleared', getActiveClient() === null);
  assertEq('  memory dir → root after clear', getMemoryDir(), join(ROBOS_ROOT, 'context', 'memory'));
}

function testAutoHeal() {
  console.log('\n--- self-healing on missing folder ---');
  // Set client, then delete folder, then read state — should auto-clear.
  setActiveClient(TEST_SLUG);
  rmSync(TEST_DIR, { recursive: true, force: true });
  const active = getActiveClient();
  check('  state cleared when folder missing', active === null);
  check('  state file removed from disk', !existsSync(STATE_FILE));
}

// ---------- Teardown ----------

function teardown() {
  console.log('\n--- teardown ---');
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
    console.log(`  removed ${TEST_DIR}`);
  }
  if (existsSync(STATE_FILE)) {
    rmSync(STATE_FILE);
  }
  if (existsSync(STATE_BACKUP)) {
    writeFileSync(STATE_FILE, readFileSync(STATE_BACKUP));
    rmSync(STATE_BACKUP);
    console.log('  restored prior active-client.json');
  } else if (startedActive && !existsSync(STATE_FILE)) {
    // Nothing to restore (we already removed in cleanup) — but log so user knows.
  }
}

// ---------- Run ----------

try {
  setup();
  testValidation();
  testInitialState();
  testList();
  testSetClient();
  testInvalidSet();
  testCli();
  testClear();
  // Recreate test client for autoheal scenario (testClear left it on disk).
  mkdirSync(join(TEST_DIR, 'brand'), { recursive: true });
  mkdirSync(join(TEST_DIR, 'context'), { recursive: true });
  testAutoHeal();
} catch (e) {
  failures++;
  console.error(`\nUNEXPECTED ERROR: ${e.stack || e.message}`);
} finally {
  teardown();
}

console.log(`\n=========================`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${failures}`);
console.log(`=========================`);
process.exit(failures > 0 ? 1 : 0);
