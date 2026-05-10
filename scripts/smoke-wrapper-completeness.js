#!/usr/bin/env node
/**
 * smoke-wrapper-completeness.js — Pin CP-4 (wrappers exist for student-facing CLI).
 *
 * Each student-facing CLI command is wrapped in `.cmd` (Windows), `.ps1`
 * (Powershell), and `.sh` (Mac/Linux). Source of truth: `.js` file. If a
 * wrapper goes missing, students on that platform can't run it.
 *
 * Special case: `robos` is the bash launcher with no extension (per Unix
 * convention) — its sibling Windows wrappers are `robos.cmd` + `robos.ps1`
 * and the Node source is `robos.js`.
 *
 * Asserts:
 *   1. Each wrapped command has all 4 files (.js source + 3 wrappers).
 *   2. Each .cmd / .ps1 / .sh delegates to `node scripts/{name}.js`.
 *   3. (Smoke-cross-platform-scripts already round-trips invocation; this
 *      smoke covers existence + delegation, not behavior.)
 */

import { readFileSync, existsSync } from 'node:fs';
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

// Commands wrapped in 3 platforms. Each name has .js + .cmd + .ps1 + .sh
// (except `robos` which uses bare-name bash wrapper instead of .sh).
const WRAPPED_COMMANDS = [
  { name: 'add-client',    bashExt: '.sh' },
  { name: 'add-skill',     bashExt: '.sh' },
  { name: 'list-skills',   bashExt: '.sh' },
  { name: 'remove-skill',  bashExt: '.sh' },
  { name: 'start-crons',   bashExt: '.sh' },
  { name: 'stop-crons',    bashExt: '.sh' },
  { name: 'status-crons',  bashExt: '.sh' },
  { name: 'setup',         bashExt: '.sh' },
  { name: 'update',        bashExt: '.sh' },
  { name: 'robos',         bashExt: '' }, // bare-name bash wrapper
];

const SCRIPTS_DIR = join(ROBOS_ROOT, 'scripts');

console.log(`--- Wrapper completeness (${WRAPPED_COMMANDS.length} commands × 4 files) ---`);

for (const { name, bashExt } of WRAPPED_COMMANDS) {
  // .js source — must exist
  check(`scripts/${name}.js exists (source)`, existsSync(join(SCRIPTS_DIR, `${name}.js`)));
  // .cmd wrapper
  check(`scripts/${name}.cmd exists (Windows cmd)`, existsSync(join(SCRIPTS_DIR, `${name}.cmd`)));
  // .ps1 wrapper
  check(`scripts/${name}.ps1 exists (Windows Powershell)`, existsSync(join(SCRIPTS_DIR, `${name}.ps1`)));
  // bash wrapper (.sh or bare name)
  const bashPath = join(SCRIPTS_DIR, `${name}${bashExt}`);
  check(`scripts/${name}${bashExt} exists (bash)`, existsSync(bashPath));
}

console.log('\n--- Wrapper delegates to node scripts/{name}.js ---');

// Wrapper invocation patterns differ by shell:
//   .cmd / .sh: single-line `node "..../{name}.js"` (or `exec node ...`).
//   .ps1: multi-line — `Get-Command node` + later `Join-Path ... '{name}.js'`
//         then `& $node.Source $jsPath`.
//
// Single check that works for all: (a) file references `{name}.js` in a
// non-comment line, AND (b) file invokes Node somehow (literal `node`,
// `Get-Command node`, or `& $node`).
const COMMENT_LINE = /^\s*(#|REM\b|::|\/\/)/i;
function invokesNodeScript(src, name) {
  const targetRe = new RegExp(`${name.replace(/[-.]/g, '\\$&')}\\.js`, 'i');
  const nodeRe = /\bnode\b/i;
  let mentionsTarget = false;
  let mentionsNode = false;
  for (const line of src.split(/\r?\n/)) {
    if (COMMENT_LINE.test(line)) continue;
    if (targetRe.test(line)) mentionsTarget = true;
    if (nodeRe.test(line)) mentionsNode = true;
    if (mentionsTarget && mentionsNode) return true;
  }
  return mentionsTarget && mentionsNode;
}

// Exception: update.sh intentionally implements a different (git-clone) update
// flow rather than delegating to update.js (which is the tarball flow). This
// is a known cross-platform behavioral split — Win/.cmd/.ps1 = tarball update,
// Mac-Linux/.sh = git pull update. If we ever unify, this exception goes away.
const DELEGATION_EXEMPT = new Set(['update.sh']);

for (const { name, bashExt } of WRAPPED_COMMANDS) {
  const cmdPath = join(SCRIPTS_DIR, `${name}.cmd`);
  if (existsSync(cmdPath)) {
    const src = readFileSync(cmdPath, 'utf-8');
    check(`${name}.cmd invokes node ${name}.js`, invokesNodeScript(src, name),
      'wrapper drift — expected `node scripts/{name}.js` invocation');
  }
  const ps1Path = join(SCRIPTS_DIR, `${name}.ps1`);
  if (existsSync(ps1Path)) {
    const src = readFileSync(ps1Path, 'utf-8');
    check(`${name}.ps1 invokes node ${name}.js`, invokesNodeScript(src, name));
  }
  const bashPath = join(SCRIPTS_DIR, `${name}${bashExt}`);
  if (existsSync(bashPath)) {
    const src = readFileSync(bashPath, 'utf-8');
    const fname = `${name}${bashExt}`;
    if (DELEGATION_EXEMPT.has(fname)) {
      console.log(`  SKIP  ${fname} delegation check (known design split: dev-install via git pull)`);
      continue;
    }
    check(`${fname} invokes node ${name}.js`, invokesNodeScript(src, name));
  }
}

console.log('\n=========================');
console.log(`PASSED: ${pass}`);
console.log(`FAILED: ${fail}`);
console.log('=========================');
process.exit(fail > 0 ? 1 : 0);
