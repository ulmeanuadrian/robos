#!/usr/bin/env node
/**
 * smoke-env-api-secrets.js — Pin SEC-2 (.env GET API never exposes secrets).
 *
 * `getEnv()` in centre/api/settings.js returns one entry per .env key, with
 * `value: null` and `masked: true` for any key matching SECRET_PATTERNS
 * (KEY|SECRET|TOKEN|PASSWORD|PASS|PRIVATE|CREDENTIAL|DSN|AUTH). Non-secret
 * keys (PORT, paths, toggles) include their value so the dashboard can show
 * "PORT=3001" in the UI.
 *
 * Threat: even with Bearer auth, secret values must NEVER leave .env via
 * the API — defense in depth. If a future refactor accidentally drops the
 * masking, this smoke fails immediately.
 *
 * Strategy:
 *   1. Source check: SECRET_PATTERNS contains expected entries.
 *   2. Source check: getEnv body has `value: secret ? null : entry.value`.
 *   3. Live call: import getEnv, run against actual .env, assert every
 *      secret-named key has value === null AND masked === true.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getEnv } from '../centre/api/settings.js';

const __filename = fileURLToPath(import.meta.url);
const ROBOS_ROOT = join(dirname(__filename), '..');
const SETTINGS_SRC_PATH = join(ROBOS_ROOT, 'centre', 'api', 'settings.js');

let pass = 0;
let fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`); }
}

// --- Test 1: source-level invariants ---
console.log('--- Source check ---');
{
  if (!existsSync(SETTINGS_SRC_PATH)) {
    check('settings.js exists', false);
  } else {
    const src = readFileSync(SETTINGS_SRC_PATH, 'utf-8');
    const requiredPatterns = ['KEY', 'SECRET', 'TOKEN', 'PASSWORD', 'PASS', 'PRIVATE', 'CREDENTIAL', 'DSN', 'AUTH'];
    for (const p of requiredPatterns) {
      check(`SECRET_PATTERNS contains "${p}"`,
        new RegExp(`SECRET_PATTERNS\\s*=\\s*\\[[^\\]]*['"]${p}['"]`, 's').test(src));
    }
    check('getEnv masks secrets via `value: secret ? null : entry.value`',
      /value:\s*secret\s*\?\s*null\s*:\s*entry\.value/.test(src),
      'masking expression missing or refactored — secret values may leak');
    check('isSecret consults SECRET_PATTERNS',
      /isSecret\s*\([^)]*\)\s*\{[\s\S]*?SECRET_PATTERNS\.some/.test(src),
      'isSecret should iterate SECRET_PATTERNS');
  }
}

// --- Test 2: live invocation against real .env ---
console.log('\n--- Live getEnv() ---');
{
  const result = getEnv();
  check('getEnv returns { entries, warnings }',
    Array.isArray(result.entries) && Array.isArray(result.warnings));
  if (!Array.isArray(result.entries)) {
    process.exit(1);
  }
  check('getEnv returns >= 1 entry', result.entries.length >= 1, `got ${result.entries.length}`);

  // Inspect each entry: secret-named keys must have value === null
  const SECRET_HINTS = /KEY|SECRET|TOKEN|PASSWORD|PASS|PRIVATE|CREDENTIAL|DSN|AUTH/i;
  const NON_SECRET_OVERRIDES = new Set([
    'LICENSE_JWT_PRIVATE_KEY_PATH',  // path, not key value
    'LICENSE_JWT_PUBLIC_KEY_PATH',
  ]);

  let secretEntries = 0;
  let nonSecretEntries = 0;
  let leaks = 0;

  for (const e of result.entries) {
    const looksSecret = SECRET_HINTS.test(e.key) && !NON_SECRET_OVERRIDES.has(e.key);
    if (looksSecret) {
      secretEntries++;
      if (e.value !== null) {
        leaks++;
        console.log(`  LEAK   ${e.key} returned value (expected null)`);
      }
      if (!e.masked) {
        leaks++;
        console.log(`  LEAK   ${e.key} masked=false (expected true)`);
      }
    } else {
      nonSecretEntries++;
    }
  }

  check(`secret-named entries discovered (${secretEntries})`, secretEntries >= 1,
    'expected at least 1 secret key in .env (e.g. ROBOS_DASHBOARD_TOKEN)');
  check('zero leaks: all secret-named keys have value=null + masked=true', leaks === 0,
    `${leaks} leak(s) — see above`);
  check(`non-secret entries also discovered (${nonSecretEntries})`, nonSecretEntries >= 1,
    'expected at least 1 non-secret (e.g. PORT)');

  // Verify NON_SECRET_OVERRIDES specifically: if the path-keys are present,
  // they should NOT be masked.
  for (const e of result.entries) {
    if (NON_SECRET_OVERRIDES.has(e.key)) {
      check(`override "${e.key}" exposes value (path, not secret)`, e.masked === false,
        `path keys are not secrets; UI needs to show them`);
    }
  }
}

console.log('\n=========================');
console.log(`PASSED: ${pass}`);
console.log(`FAILED: ${fail}`);
console.log('=========================');
process.exit(fail > 0 ? 1 : 0);
