#!/usr/bin/env node
// Bootstrap and sync `.env` against `.env.example`.
//
// Behavior:
//   1. If `.env` does not exist → copy `.env.example` to `.env`.
//   2. If `.env` exists → for every key in `.env.example` that is missing from
//      `.env`, append it at the end with a `# added by setup-env <YYYY-MM-DD>` marker.
//      Existing values in `.env` are NEVER touched.
//   3. ROBOS_DASHBOARD_TOKEN: if empty, generate 64-char hex and write it.
//   4. data/required-secrets.json (if exists) → adds skill-declared keys missing
//      from .env.example AND .env (used after `add-skill` of a skill with new secrets).
//
// Atomic: writes to `.env.tmp` then renames. Backup of previous `.env` saved to
// `.env.bak` (overwritten each run — single rolling backup, intentional).
//
// Idempotent: running twice is a no-op (no duplicate adds, token preserved).
//
// Exit codes: 0 = success, 1 = error (printed to stderr).

import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';
import { parseEnv, parseEnvFile, renderEnv } from './lib/env-format.js';
import { atomicWrite } from './lib/atomic-write.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const EXAMPLE_PATH = join(ROOT, '.env.example');
const ENV_PATH = join(ROOT, '.env');
const ENV_BAK_PATH = join(ROOT, '.env.bak');
const REQUIRED_SECRETS_PATH = join(ROOT, 'data', 'required-secrets.json');

const TOKEN_KEY = 'ROBOS_DASHBOARD_TOKEN';

function today() {
  return new Date().toISOString().slice(0, 10);
}

function generateToken() {
  return randomBytes(32).toString('hex');
}

function readSkillSecrets() {
  if (!existsSync(REQUIRED_SECRETS_PATH)) return [];
  try {
    const data = JSON.parse(readFileSync(REQUIRED_SECRETS_PATH, 'utf-8'));
    if (!Array.isArray(data.keys)) return [];
    return data.keys.filter(k => typeof k === 'string');
  } catch {
    return [];
  }
}

// S26 fix (2026-05-12 codex audit MAJOR): removed local atomicWrite that used
// a global fixed `.env.tmp` path. Two concurrent setup-env.js runs would race
// on the same temp file (one renaming the other's tmp, or one finding the
// tmp gone). Now we use scripts/lib/atomic-write.js which generates a unique
// `.env.<random>.tmp` per write and cleans up on failure.

function main() {
  if (!existsSync(EXAMPLE_PATH)) {
    console.error('ERROR: .env.example missing. Cannot bootstrap.');
    process.exit(1);
  }

  const exampleParsed = parseEnvFile(EXAMPLE_PATH);
  const skillSecrets = readSkillSecrets();
  const summary = { created: false, added: [], generated_token: false };

  // Case 1: .env does not exist → copy from example
  if (!existsSync(ENV_PATH)) {
    copyFileSync(EXAMPLE_PATH, ENV_PATH);
    summary.created = true;
    // continue — we still need to generate token and add skill secrets
  } else {
    // Backup before any change. Explicit 0o600 mode (S1 fix) — copyFileSync
    // inherits source permissions on POSIX (depends on how .env was created),
    // explicit write+mode documents intent and is consistent.
    writeFileSync(ENV_BAK_PATH, readFileSync(ENV_PATH), { mode: 0o600 });
  }

  let envParsed = parseEnvFile(ENV_PATH);
  const newLines = [];

  // Add keys from example that are missing in env
  for (const exEntry of exampleParsed.entries) {
    if (exEntry.kind !== 'assignment') continue;
    if (envParsed.byKey.has(exEntry.key)) continue;
    newLines.push({ kind: 'assignment', key: exEntry.key, value: exEntry.value, line: '' });
    summary.added.push(exEntry.key);
  }

  // Add keys from skill-declared secrets that are missing in BOTH example and env
  for (const key of skillSecrets) {
    if (envParsed.byKey.has(key)) continue;
    if (exampleParsed.byKey.has(key)) continue; // would already be added above
    newLines.push({ kind: 'assignment', key, value: '', line: '' });
    summary.added.push(`${key} (skill-declared)`);
  }

  // Generate dashboard token if empty
  let tokenEntry = envParsed.byKey.get(TOKEN_KEY);
  // The token may be in newLines if it was just added from example; find it there too
  if (!tokenEntry) tokenEntry = newLines.find(e => e.key === TOKEN_KEY);

  const tokenValue = tokenEntry ? tokenEntry.value : '';
  if (tokenEntry && (tokenValue == null || tokenValue.trim() === '')) {
    const generated = generateToken();
    tokenEntry.value = generated;
    summary.generated_token = true;
  }

  if (newLines.length > 0 || summary.generated_token) {
    let entries = [...envParsed.entries];

    if (newLines.length > 0) {
      const dateMarker = `# added by setup-env ${today()}`;
      // Ensure trailing blank line before banner if file doesn't end with one
      const last = entries[entries.length - 1];
      if (last && last.line && last.line.trim() !== '') {
        entries.push({ kind: 'comment', line: '' });
      }
      entries.push({ kind: 'comment', line: dateMarker });
      entries.push(...newLines);
    }

    // If we mutated tokenEntry in-place AND it was in envParsed, render handles it.
    // If tokenEntry came from newLines, it's already in entries (we just appended it).
    atomicWrite(ENV_PATH, renderEnv(entries) + '\n', { mode: 0o600 });
  }

  // F8 fix: detect orphan keys in .env that are NOT in .env.example AND NOT
  // declared by an installed skill. Likely leftover from a removed skill.
  // Report only — never auto-delete (operator may have customized values).
  const orphans = [];
  const skillSecretSet = new Set(skillSecrets);
  for (const entry of envParsed.entries) {
    if (entry.kind !== 'assignment') continue;
    if (exampleParsed.byKey.has(entry.key)) continue;
    if (skillSecretSet.has(entry.key)) continue;
    // Skip well-known runtime/internal keys never in example
    if (entry.key === 'PORT' || entry.key === 'NODE_ENV' || entry.key === 'DEBUG') continue;
    orphans.push(entry.key);
  }

  // Reporting
  if (summary.created) {
    console.log('[setup-env] Initialized .env from .env.example');
  }
  if (summary.added.length > 0) {
    console.log(`[setup-env] Added ${summary.added.length} new slot(s):`);
    for (const k of summary.added) console.log(`  + ${k}`);
  }
  if (summary.generated_token) {
    console.log(`[setup-env] Generated ${TOKEN_KEY} (dashboard auth)`);
    console.log('  Token-ul e in .env. Pentru cereri API: Authorization: Bearer <token>.');
  }
  if (orphans.length > 0) {
    console.log('');
    console.log(`[setup-env] ${orphans.length} key(s) orfane in .env (nu sunt in .env.example sau in skills installed):`);
    for (const k of orphans) console.log(`  ? ${k}`);
    console.log('  (nu sterg automat — sterge manual daca au ramas dintr-un skill removed)');
  }
  if (!summary.created && summary.added.length === 0 && !summary.generated_token && orphans.length === 0) {
    console.log('[setup-env] .env already in sync with .env.example. No changes.');
  }
}

try {
  main();
} catch (err) {
  console.error('[setup-env] FATAL:', err.message);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
}
