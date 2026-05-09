#!/usr/bin/env node
// scripts/smoke-cross-platform-scripts.js — U5 conversion verification.
//
// Verifies that the .js conversions of bash-only scripts work on the host
// platform. Tests:
//   - list-skills.js (read-only) — exits 0, output looks reasonable
//   - status-crons.js (read-only) — exits 0 (or 1 if no DB), output ok
//   - add-client.js — creates test client, files exist, then cleans up
//   - remove-skill.js with --yes — round-trip add+remove a small skill
//
// add-skill.js is implicitly tested via remove-skill round-trip.
// start/stop-crons NOT tested live (would spawn a real daemon).

import { existsSync, rmSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROBOS_ROOT = join(__dirname, '..');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log(`  PASS  ${msg}`); }
  else { fail++; console.log(`  FAIL  ${msg}`); }
}

function runScript(name, args = []) {
  return spawnSync(process.execPath, [join(__dirname, name), ...args], {
    encoding: 'utf-8',
    cwd: ROBOS_ROOT,
    shell: false,
  });
}

console.log('--- list-skills.js ---');
{
  const r = runScript('list-skills.js');
  assert(r.status === 0, `list-skills exits 0 (got ${r.status})`);
  assert(r.stdout.includes('=== robOS Skills ==='), 'has expected header');
  assert(r.stdout.includes('INSTALATE:'), 'shows INSTALATE section');
  assert(r.stdout.includes('DISPONIBILE'), 'shows DISPONIBILE section');
}

console.log('\n--- status-crons.js ---');
{
  const r = runScript('status-crons.js');
  // exit 0 (jobs found) or 1 (no DB) both acceptable; what matters is no crash
  assert(r.status === 0 || r.status === 1, `status-crons exits cleanly (got ${r.status})`);
  assert(r.stdout.includes('=== robOS Cron Status ==='), 'has expected header');
}

console.log('\n--- add-client.js round-trip ---');
{
  const TEST_SLUG = `zz-smoke-${process.pid}`;
  const TEST_DIR = join(ROBOS_ROOT, 'clients', TEST_SLUG);

  // Cleanup any leftover from prior failed runs
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });

  const r = runScript('add-client.js', [TEST_SLUG, 'Smoke Test Client']);
  assert(r.status === 0, `add-client exits 0 (got ${r.status}). stderr: ${r.stderr.trim()}`);
  assert(existsSync(TEST_DIR), 'client dir created');
  assert(existsSync(join(TEST_DIR, 'brand', 'voice.md')), 'brand/voice.md created');
  assert(existsSync(join(TEST_DIR, 'context', 'USER.md')), 'context/USER.md created');
  assert(existsSync(join(TEST_DIR, 'context', 'memory')), 'context/memory/ created');
  assert(existsSync(join(TEST_DIR, 'CLAUDE.md')), 'CLAUDE.md created');
  assert(existsSync(join(TEST_DIR, 'cron', 'jobs')), 'cron/jobs created');

  const userMd = readFileSync(join(TEST_DIR, 'context', 'USER.md'), 'utf-8');
  assert(userMd.includes('Smoke Test Client'), 'USER.md contains client name');
  assert(userMd.includes(TEST_SLUG), 'USER.md contains slug');

  // Reject duplicate
  const r2 = runScript('add-client.js', [TEST_SLUG]);
  assert(r2.status !== 0, 'add-client rejects duplicate');
  assert((r2.stderr || '').includes('deja exista'), 'duplicate rejection message correct');

  // Reject invalid slug
  const r3 = runScript('add-client.js', ['INVALID_UPPER']);
  assert(r3.status !== 0, 'add-client rejects invalid slug (uppercase)');
  assert((r3.stderr || '').includes('Slug invalid'), 'invalid slug message correct');

  // Cleanup
  rmSync(TEST_DIR, { recursive: true, force: true });
  assert(!existsSync(TEST_DIR), 'cleanup successful');
}

console.log('\n--- add-skill.js + remove-skill.js round-trip ---');
{
  // Use a planned skill from catalog that's NOT installed by default.
  // tool-drive is in catalog with source — install it, then remove it.
  const TEST_SKILL = 'tool-drive';
  const SKILL_DIR = join(ROBOS_ROOT, 'skills', TEST_SKILL);
  const wasInstalled = existsSync(SKILL_DIR);

  if (!wasInstalled) {
    const r = runScript('add-skill.js', [TEST_SKILL]);
    assert(r.status === 0, `add-skill ${TEST_SKILL} exits 0 (got ${r.status})`);
    assert(existsSync(SKILL_DIR), 'skill dir created in skills/');
    assert(existsSync(join(SKILL_DIR, 'SKILL.md')), 'SKILL.md copied');

    // Now remove
    const r2 = runScript('remove-skill.js', [TEST_SKILL, '--yes']);
    assert(r2.status === 0, `remove-skill ${TEST_SKILL} exits 0 (got ${r2.status})`);
    assert(!existsSync(SKILL_DIR), 'skill dir removed');
  } else {
    // Skip if pre-existing — don't accidentally remove user's installed skill
    console.log(`  SKIP  ${TEST_SKILL} pre-installed; skipping round-trip (avoid removing user data)`);
  }

  // add-skill rejects unknown skill
  const r3 = runScript('add-skill.js', ['this-skill-does-not-exist-xyz']);
  assert(r3.status !== 0, 'add-skill rejects unknown skill');

  // remove-skill rejects unknown skill
  const r4 = runScript('remove-skill.js', ['this-skill-does-not-exist-xyz', '--yes']);
  assert(r4.status !== 0, 'remove-skill rejects unknown skill');
  assert((r4.stderr || '').includes('nu e instalat'), 'unknown skill message correct');
}

console.log('\n=========================');
console.log(`PASSED: ${pass}`);
console.log(`FAILED: ${fail}`);
console.log('=========================');

process.exit(fail > 0 ? 1 : 0);
