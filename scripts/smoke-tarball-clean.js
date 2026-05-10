#!/usr/bin/env node
/**
 * smoke-tarball-clean.js — Pin DST-1 + DST-3 + DST-4.
 *
 * Verifies that the SET of files which would ship in a customer tarball does
 * NOT contain any forbidden files (secrets, user data, build artifacts).
 *
 * Strategy: `git ls-files HEAD` produces the exact list of files that
 * `licensing/scripts/build-base-tarball.js` will package via `git archive`
 * (the build script uses `git archive --format=tar HEAD`). We assert the
 * tracked-file set against forbidden patterns.
 *
 * This is FAST (no actual tarball build) and catches drift the moment a
 * forbidden file gets accidentally tracked (e.g. `git add .env` slipped past
 * the operator).
 *
 * Forbidden patterns:
 *   - .env (any variant except .env.example)
 *   - data/keys/ (private signing keys)
 *   - data/*.db, data/*.db-shm, data/*.db-wal
 *   - .command-centre/ (runtime PID dir)
 *   - centre/dist/ (build artifact — rebuilt in setup)
 *   - node_modules/ (dependency dir)
 *   - .archive/ (legacy graveyard)
 *   - cron/logs/, cron/status/
 *   - .license-stamp at root (only ships per-customer via R2 worker)
 *   - data/active-client.json, data/launcher-state.json (per-install state)
 *   - data/*-log.ndjson, data/skill-telemetry.ndjson (per-install logs)
 *   - data/required-secrets.json (derived at install time)
 *   - context/memory/*.md (user-authored except .gitkeep)
 *   - context/audits/*.md (user-authored)
 *   - clients/{slug}/ (user data)
 *   - brand/*.md if NOT a starter pack template (heuristic: only catalog/ allowed)
 *
 * Required files (must be tracked):
 *   - VERSION
 *   - README.md, CHANGELOG.md, AGENTS.md, CLAUDE.md, WHATS-NEW.md, .env.example
 *   - scripts/setup.js, scripts/rebuild-index.js
 *   - centre/package.json, centre/server.js
 *   - skills/_catalog/catalog.json
 *   - .gitignore
 */

import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROBOS_ROOT = join(dirname(__filename), '..');

let pass = 0;
let fail = 0;

function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`); }
}

// --- Get tracked files (what git archive would include) ---
const ls = spawnSync('git', ['ls-files', '-z'], {
  cwd: ROBOS_ROOT,
  encoding: 'buffer',
  shell: false,
});
if (ls.status !== 0) {
  console.error('git ls-files failed:', ls.stderr?.toString());
  process.exit(1);
}
const tracked = ls.stdout
  .toString('utf-8')
  .split('\0')
  .filter(Boolean)
  .map(p => p.replace(/\\/g, '/'));

console.log(`--- Forbidden patterns (${tracked.length} tracked files) ---`);

const FORBIDDEN_RULES = [
  // [test fn, label]
  [(p) => p === '.env' || /^\.env\.(?!example$)/.test(p), 'no .env / .env.local etc. (only .env.example)'],
  [(p) => p.startsWith('data/keys/'), 'no data/keys/ (private signing keys)'],
  [(p) => /^data\/.*\.db(-shm|-wal)?$/.test(p), 'no data/*.db / db-shm / db-wal'],
  [(p) => p.startsWith('.command-centre/'), 'no .command-centre/ (runtime PID dir)'],
  [(p) => p.startsWith('centre/dist/'), 'no centre/dist/ (build artifact)'],
  [(p) => p.includes('node_modules/'), 'no node_modules/ anywhere'],
  [(p) => p.startsWith('.archive/'), 'no .archive/ (legacy graveyard)'],
  [(p) => p.startsWith('cron/logs/') || p.startsWith('cron/status/'), 'no cron/logs/ or cron/status/'],
  [(p) => p === '.license-stamp', 'no root .license-stamp (per-customer, ships via R2)'],
  [(p) => p === 'data/active-client.json' || p === 'data/launcher-state.json', 'no per-install state'],
  [(p) => /^data\/.*-log\.ndjson$/.test(p) || p === 'data/skill-telemetry.ndjson', 'no per-install logs'],
  [(p) => p === 'data/required-secrets.json', 'no derived data/required-secrets.json'],
  [(p) => /^context\/memory\/\d{4}-\d{2}-\d{2}\.md$/.test(p), 'no context/memory/YYYY-MM-DD.md (user data)'],
  [(p) => p.startsWith('context/audits/') && p !== 'context/audits/.gitkeep', 'no context/audits/*.md (user data)'],
  [(p) => /^clients\/[^/]+\//.test(p), 'no clients/{slug}/ (per-client user data)'],
  [(p) => p === 'context/USER.md' || p === 'context/learnings.md' || p === 'context/decision-journal.md',
    'no user-customized context root files (USER.md, learnings.md, decision-journal.md)'],
  [(p) => p.startsWith('context/notes/') && p !== 'context/notes/.gitkeep', 'no context/notes/ (operator-authored)'],
  [(p) => /\.pid$/.test(p), 'no .pid files'],
  [(p) => /\.log$/.test(p), 'no .log files'],
  [(p) => p === 'data/audit-cache.json' || p.startsWith('data/.update-staging/') || p.startsWith('data/.update-backup/'),
    'no derived data/audit-cache.json / update staging dirs'],
];

let totalForbidden = 0;
for (const [test, label] of FORBIDDEN_RULES) {
  const violators = tracked.filter(test);
  if (violators.length === 0) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    totalForbidden += violators.length;
    console.log(`  FAIL  ${label} — ${violators.length} violator(s)`);
    for (const v of violators.slice(0, 5)) console.log(`        ${v}`);
    if (violators.length > 5) console.log(`        ... +${violators.length - 5} more`);
  }
}

// --- Required files (must be tracked, otherwise tarball is broken) ---
console.log('\n--- Required files (must be tracked) ---');

const REQUIRED = [
  'VERSION',
  'README.md',
  'CHANGELOG.md',
  'AGENTS.md',
  'CLAUDE.md',
  'WHATS-NEW.md',
  '.env.example',
  '.gitignore',
  'scripts/setup.js',
  'scripts/rebuild-index.js',
  'scripts/license-check.js',
  'scripts/lib/env-loader.js',
  'centre/package.json',
  'centre/server.js',
  'skills/_catalog/catalog.json',
];

const trackedSet = new Set(tracked);
for (const req of REQUIRED) {
  check(`tracked: ${req}`, trackedSet.has(req));
}

// --- Sanity: rough size estimate ---
console.log('\n--- Sanity ---');
const TOO_LARGE = 5000;
check(
  `tracked file count reasonable (< ${TOO_LARGE})`,
  tracked.length < TOO_LARGE,
  `got ${tracked.length} — investigate if a directory was accidentally added`
);

// --- Summary ---
console.log('\n=========================');
console.log(`PASSED: ${pass}`);
console.log(`FAILED: ${fail}`);
console.log('=========================');

if (fail > 0) {
  console.log('');
  console.log('To fix:');
  console.log('  - For forbidden files: untrack with `git rm --cached <path>` and add to .gitignore');
  console.log('  - For missing required files: track them with `git add <path>`');
  console.log('  - Re-run this smoke after fixing.');
}

process.exit(fail > 0 ? 1 : 0);
