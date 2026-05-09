#!/usr/bin/env node
// scripts/smoke-env-toggles.js — Verifica ca toggle-urile din .env chiar functioneaza.
//
// De ce: bug-ul F1 din audit. Hooks-urile rulau cu env curat, ignorand toate
// knob-urile documentate (ROBOS_CHECKPOINT_DISABLED, ROBOS_LOOP_DETECTOR_DISABLED, etc.).
//
// Strategy: invoca env-loader.js cu un .env temporar care contine toggle-uri,
// asserteaza ca dupa loadEnv() process.env contine valorile asteptate. Apoi
// verifica ca caller-set values (process.env-ul existent) nu sunt suprascrise.
//
// Cross-platform: foloseste os.tmpdir() pentru .env temporar — Mac+Windows safe.

import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadEnv, _resetForTests } from './lib/env-loader.js';

const __filename = fileURLToPath(import.meta.url);

let pass = 0, fail = 0;

function assert(cond, msg) {
  if (cond) { pass++; console.log(`  PASS  ${msg}`); }
  else { fail++; console.log(`  FAIL  ${msg}`); }
}

function makeTestEnvDir(content) {
  const dir = join(tmpdir(), `robos-smoke-env-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, '.env'), content, 'utf-8');
  return dir;
}

function clearEnvKeys(...keys) {
  for (const k of keys) delete process.env[k];
}

console.log('--- env-loader basic load ---');
{
  _resetForTests();
  clearEnvKeys('ROBOS_CHECKPOINT_DISABLED', 'ROBOS_LOOP_DETECTOR_DISABLED',
    'ROBOS_ACTIVITY_DISABLED', 'ROBOS_CANDIDATES_DISABLED', 'ROBOS_LOOP_DETECTOR_THRESHOLD');

  const dir = makeTestEnvDir([
    '# Test .env',
    'ROBOS_CHECKPOINT_DISABLED=1',
    'ROBOS_LOOP_DETECTOR_DISABLED=1',
    'ROBOS_LOOP_DETECTOR_THRESHOLD=5',
    '',
    'ROBOS_ACTIVITY_DISABLED=0',
    'ROBOS_CANDIDATES_DISABLED=1',
  ].join('\n'));

  const result = loadEnv({ rootDir: dir });
  assert(result.loaded === true, 'loadEnv reports loaded=true');
  assert(result.keys === 5, `loadEnv reports 5 keys set (got ${result.keys})`);
  assert(process.env.ROBOS_CHECKPOINT_DISABLED === '1', 'CHECKPOINT_DISABLED set');
  assert(process.env.ROBOS_LOOP_DETECTOR_DISABLED === '1', 'LOOP_DETECTOR_DISABLED set');
  assert(process.env.ROBOS_LOOP_DETECTOR_THRESHOLD === '5', 'THRESHOLD set');
  assert(process.env.ROBOS_ACTIVITY_DISABLED === '0', 'ACTIVITY_DISABLED set');
  assert(process.env.ROBOS_CANDIDATES_DISABLED === '1', 'CANDIDATES_DISABLED set');

  rmSync(dir, { recursive: true, force: true });
  clearEnvKeys('ROBOS_CHECKPOINT_DISABLED', 'ROBOS_LOOP_DETECTOR_DISABLED',
    'ROBOS_ACTIVITY_DISABLED', 'ROBOS_CANDIDATES_DISABLED', 'ROBOS_LOOP_DETECTOR_THRESHOLD');
}

console.log('\n--- caller-set wins (don\'t overwrite parent process.env) ---');
{
  _resetForTests();
  process.env.ROBOS_CHECKPOINT_DISABLED = 'parent-value';

  const dir = makeTestEnvDir('ROBOS_CHECKPOINT_DISABLED=env-file-value\n');
  loadEnv({ rootDir: dir });
  assert(process.env.ROBOS_CHECKPOINT_DISABLED === 'parent-value',
    'parent process.env value preserved (env file did NOT overwrite)');

  rmSync(dir, { recursive: true, force: true });
  delete process.env.ROBOS_CHECKPOINT_DISABLED;
}

console.log('\n--- missing .env: graceful, no throw ---');
{
  _resetForTests();
  const dir = join(tmpdir(), `robos-nonexistent-${Date.now()}`);
  let threw = false;
  let result;
  try {
    result = loadEnv({ rootDir: dir });
  } catch (e) {
    threw = true;
  }
  assert(!threw, 'no throw on missing .env');
  assert(result.loaded === false, 'reports loaded=false');
  assert(result.reason === 'missing', 'reason=missing');
}

console.log('\n--- malformed lines ignored ---');
{
  _resetForTests();
  clearEnvKeys('ROBOS_VALID_KEY', 'NUMERIC_START', '123_INVALID');

  const dir = makeTestEnvDir([
    '# comment line',
    '',
    '   ',
    'no-equals-sign-here',
    '=value-without-key',
    '123_INVALID=should-be-rejected',
    'ROBOS_VALID_KEY=ok-value',
    '   spaces-around-key   =trimmed',
  ].join('\n'));

  loadEnv({ rootDir: dir });
  assert(process.env.ROBOS_VALID_KEY === 'ok-value', 'valid key set');
  assert(process.env['123_INVALID'] === undefined, 'numeric-start key rejected');
  assert(process.env['spaces-around-key'] === undefined, 'invalid key char (-) rejected');

  rmSync(dir, { recursive: true, force: true });
  delete process.env.ROBOS_VALID_KEY;
}

console.log('\n--- quoted values ---');
{
  _resetForTests();
  clearEnvKeys('ROBOS_QUOTED_DBL', 'ROBOS_QUOTED_SGL', 'ROBOS_UNQUOTED', 'ROBOS_PARTIAL_QUOTE');

  const dir = makeTestEnvDir([
    'ROBOS_QUOTED_DBL="hello world"',
    "ROBOS_QUOTED_SGL='single quoted'",
    'ROBOS_UNQUOTED=plain value',
    'ROBOS_PARTIAL_QUOTE="unbalanced',
  ].join('\n'));

  loadEnv({ rootDir: dir });
  assert(process.env.ROBOS_QUOTED_DBL === 'hello world', 'double quotes stripped');
  assert(process.env.ROBOS_QUOTED_SGL === 'single quoted', 'single quotes stripped');
  assert(process.env.ROBOS_UNQUOTED === 'plain value', 'unquoted preserved');
  assert(process.env.ROBOS_PARTIAL_QUOTE === '"unbalanced', 'unbalanced quotes preserved as-is');

  rmSync(dir, { recursive: true, force: true });
  clearEnvKeys('ROBOS_QUOTED_DBL', 'ROBOS_QUOTED_SGL', 'ROBOS_UNQUOTED', 'ROBOS_PARTIAL_QUOTE');
}

console.log('\n--- BOM stripping (Windows editors sometimes add) ---');
{
  _resetForTests();
  clearEnvKeys('ROBOS_BOM_KEY');

  const dir = makeTestEnvDir('﻿ROBOS_BOM_KEY=ok\n');
  const result = loadEnv({ rootDir: dir });
  assert(process.env.ROBOS_BOM_KEY === 'ok', 'BOM stripped from first line');

  rmSync(dir, { recursive: true, force: true });
  delete process.env.ROBOS_BOM_KEY;
}

console.log('\n--- CRLF line endings (Windows-saved .env) ---');
{
  _resetForTests();
  clearEnvKeys('ROBOS_CRLF_A', 'ROBOS_CRLF_B');

  const dir = makeTestEnvDir('ROBOS_CRLF_A=alpha\r\nROBOS_CRLF_B=beta\r\n');
  loadEnv({ rootDir: dir });
  assert(process.env.ROBOS_CRLF_A === 'alpha', 'CRLF: first key parsed');
  assert(process.env.ROBOS_CRLF_B === 'beta', 'CRLF: second key parsed');

  rmSync(dir, { recursive: true, force: true });
  clearEnvKeys('ROBOS_CRLF_A', 'ROBOS_CRLF_B');
}

console.log('\n--- idempotency (default rootDir, no override) ---');
{
  _resetForTests();
  const r1 = loadEnv();
  const r2 = loadEnv();
  assert(r2.reason === 'already-loaded', '2nd call without rootDir reports already-loaded');
}

console.log('\n=========================');
console.log(`PASSED: ${pass}`);
console.log(`FAILED: ${fail}`);
console.log('=========================');

process.exit(fail > 0 ? 1 : 0);
