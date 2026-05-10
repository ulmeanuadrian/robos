#!/usr/bin/env node
/**
 * smoke-version-sync.js — Pin LCY-1 + DOC-4 (version single-source).
 *
 * Asserts:
 *   1. Node minimum version is consistently 22.12.0 (or higher) in every
 *      surface that documents a minimum: setup wrappers (.cmd/.ps1/.sh/.js),
 *      robos.* launcher, update.* scripts, README, docs/INSTALL.md,
 *      WHATS-NEW.md, licensing/src/lib/email.js, sandbox.wsb,
 *      centre/package.json engines.node.
 *
 *   2. robOS version is consistent across:
 *      - VERSION (root file, source of truth)
 *      - licensing/wrangler.toml [vars] CURRENT_ROBOS_VERSION
 *      - README.md "Versiune actuala:" line
 *
 * If invariant LCY-1 / DOC-4 was true, this passes. If a future fix bumps
 * Node minimum or robOS version, every cited surface must be updated; this
 * smoke catches drift.
 *
 * Exit 0 = green; exit 1 = at least one drift found.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROBOS_ROOT = join(__dirname, '..');

// --- Single source of truth ---
const MIN_NODE = '22.12.0';
const ROBOS_VERSION = readFileSync(join(ROBOS_ROOT, 'VERSION'), 'utf-8').trim();

let pass = 0;
let fail = 0;
const failures = [];

function check(label, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function readIfExists(rel) {
  const p = join(ROBOS_ROOT, rel);
  if (!existsSync(p)) return null;
  return readFileSync(p, 'utf-8');
}

// --- Section 1: Node minimum version ---

console.log(`\n--- Node minimum (${MIN_NODE}) ---`);

const NODE_FILES = [
  // [path, must-contain pattern, label]
  ['scripts/setup.js', />= ?22\.12\.0/, 'setup.js mentions 22.12.0'],
  ['scripts/setup.cmd', /22\.12/, 'setup.cmd mentions 22.12'],
  ['scripts/setup.ps1', /22\.12/, 'setup.ps1 mentions 22.12'],
  ['scripts/setup.sh', /22\.12/, 'setup.sh mentions 22.12'],
  ['scripts/robos', /22\.12/, 'robos (bash) mentions 22.12'],
  ['scripts/robos.cmd', /22\.12/, 'robos.cmd mentions 22.12'],
  ['scripts/robos.ps1', /22\.12/, 'robos.ps1 mentions 22.12'],
  ['scripts/update.cmd', /22\.12/, 'update.cmd mentions 22.12'],
  ['scripts/update.ps1', /22\.12/, 'update.ps1 mentions 22.12'],
  ['README.md', /Node ?>= ?22\.12/, 'README requires >= 22.12'],
  ['docs/INSTALL.md', /22\.12/, 'docs/INSTALL.md mentions 22.12'],
  ['WHATS-NEW.md', /22\.12/, 'WHATS-NEW.md mentions 22.12'],
  ['licensing/src/lib/email.js', /22\.12/, 'welcome email mentions 22.12'],
  ['scripts/test-env/sandbox.wsb', /22\.12/, 'sandbox.wsb mentions 22.12'],
];

for (const [rel, pattern, label] of NODE_FILES) {
  const content = readIfExists(rel);
  if (content === null) {
    check(label, false, `file not found: ${rel}`);
    continue;
  }
  check(label, pattern.test(content), `pattern ${pattern} not found in ${rel}`);
}

// --- centre/package.json engines.node — semver range ---
//
// Accept ">=22.12.0" or any range that EXCLUDES Node < 22.12.0. We fail on
// ">=20" or "*" because they admit a Node version that setup.js will reject.
{
  const pkgRaw = readIfExists('centre/package.json');
  if (pkgRaw === null) {
    check('centre/package.json engines.node', false, 'file not found');
  } else {
    let pkg;
    try { pkg = JSON.parse(pkgRaw); }
    catch (e) {
      check('centre/package.json engines.node', false, `parse error: ${e.message}`);
      pkg = null;
    }
    if (pkg) {
      const engines = pkg.engines && pkg.engines.node;
      const acceptable = typeof engines === 'string' && /22\.12/.test(engines);
      check(
        'centre/package.json engines.node ⊇ 22.12.0',
        acceptable,
        `engines.node = ${JSON.stringify(engines)} (must include "22.12")`
      );
    }
  }
}

// --- Section 2: robOS version single-source ---

console.log(`\n--- robOS version (${ROBOS_VERSION}) ---`);

// wrangler.toml CURRENT_ROBOS_VERSION
{
  const wrangler = readIfExists('licensing/wrangler.toml');
  if (wrangler === null) {
    check('licensing/wrangler.toml exists', false);
  } else {
    const m = wrangler.match(/^\s*CURRENT_ROBOS_VERSION\s*=\s*"([^"]+)"\s*$/m);
    if (!m) {
      check('wrangler.toml CURRENT_ROBOS_VERSION line', false, 'line not found');
    } else {
      check(
        `wrangler CURRENT_ROBOS_VERSION = ${ROBOS_VERSION}`,
        m[1] === ROBOS_VERSION,
        `got ${m[1]}, expected ${ROBOS_VERSION}`
      );
    }
  }
}

// README "Versiune actuala:" line
{
  const readme = readIfExists('README.md');
  if (readme === null) {
    check('README.md exists', false);
  } else {
    const m = readme.match(/Versiune actuala:\*\*\s*([\d.]+)/);
    if (!m) {
      check('README "Versiune actuala:" line', false, 'line not found');
    } else {
      check(
        `README Versiune actuala = ${ROBOS_VERSION}`,
        m[1] === ROBOS_VERSION,
        `got ${m[1]}, expected ${ROBOS_VERSION}`
      );
    }
  }
}

// launcher-state.json last_robos_version (post-setup; tolerate missing pre-setup)
{
  const launcher = readIfExists('data/launcher-state.json');
  if (launcher === null) {
    console.log('  SKIP  launcher-state.json — not yet created (run setup.js)');
  } else {
    let state;
    try { state = JSON.parse(launcher); }
    catch (e) {
      check('launcher-state.json parses', false, e.message);
      state = null;
    }
    if (state) {
      check(
        `launcher last_robos_version = ${ROBOS_VERSION}`,
        state.last_robos_version === ROBOS_VERSION,
        `got ${state.last_robos_version}, expected ${ROBOS_VERSION}`
      );
    }
  }
}

// --- Summary ---

console.log(`\n=========================`);
console.log(`PASSED: ${pass}`);
console.log(`FAILED: ${fail}`);
console.log(`=========================`);

if (fail > 0) {
  console.log('\nDrift sources to align:');
  for (const f of failures) console.log(`  - ${f}`);
  console.log('');
  console.log('Single source of truth:');
  console.log(`  Node minimum: ${MIN_NODE} (constant in this smoke)`);
  console.log(`  robOS version: VERSION file = ${ROBOS_VERSION}`);
  console.log('Update the drifting file(s) to match, or update MIN_NODE in this smoke');
  console.log('if minimum was intentionally bumped.');
}

process.exit(fail > 0 ? 1 : 0);
