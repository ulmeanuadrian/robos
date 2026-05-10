#!/usr/bin/env node
/**
 * smoke-hooks-no-network.js — Pin PRV-3 (local-first hook discipline).
 *
 * Hooks fire on every prompt + every Stop. If a hook makes a network call,
 * that's a privacy regression: every interaction with Claude Code would
 * silently exfiltrate data. The license check is the only allowed network
 * call (gated by user opting into a paid product).
 *
 * Asserts: scripts that run as Claude Code hooks (UserPromptSubmit, Stop,
 * PostToolUse) import zero of `https`, `http`, `fetch`, `node:https`,
 * `node:http`. The license check is in scripts/license-check.js (separate
 * module); when imported it makes its own gated network call only on
 * first-run bind / refresh — that's by design.
 *
 * Cron scripts (audit-startup, session-timeout-detector, learnings-aggregator)
 * are tested too: they should also be local-only (no analytics phone-home).
 */

import { readFileSync } from 'node:fs';
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

// Scripts that fire on Claude Code hooks OR as cron jobs — should NOT do network.
const NO_NETWORK_SCRIPTS = [
  // Hooks (Claude Code triggered)
  'hook-user-prompt.js',
  'hook-post-tool.js',
  'checkpoint-reminder.js',
  'activity-capture.js',
  'note-candidates.js',
  // Cron jobs
  'audit-startup.js',
  'session-timeout-detector.js',
  'learnings-aggregator.js',
];

// Patterns that indicate network usage. False positive guard: license-check
// imports are allowed (it's the gated exception).
const NETWORK_PATTERNS = [
  /\bimport\s+.*\s+from\s+['"]node:https?['"]/,
  /\bimport\s+.*\s+from\s+['"]https?['"]/,
  /\bimport\s+.*\s+from\s+['"]node:net['"]/,
  /\brequire\(\s*['"](node:)?(https?|net)['"]\s*\)/,
  /\bfetch\s*\(/,
];

console.log('--- Hook & cron scripts must not network ---');

for (const name of NO_NETWORK_SCRIPTS) {
  const path = join(ROBOS_ROOT, 'scripts', name);
  let src;
  try { src = readFileSync(path, 'utf-8'); }
  catch (e) {
    check(`script exists: ${name}`, false, e.message);
    continue;
  }

  let foundOffense = null;
  for (const pat of NETWORK_PATTERNS) {
    const m = pat.exec(src);
    if (m) { foundOffense = m[0]; break; }
  }

  if (foundOffense) {
    // Allow if the offense is inside a license-check import (which is the gated exception)
    const isLicenseGate = /import\s+\{[^}]*checkLicense[^}]*\}\s+from\s+['"][^'"]*license-check/.test(src);
    if (isLicenseGate && !NETWORK_PATTERNS.slice(0, 4).some(p => p.test(src.replace(/license-check/g, 'XXX')))) {
      // The offending pattern was the license-check import indirectly — still no direct network.
      check(`${name} has no direct network usage (license-check imported as gated module)`, true);
    } else {
      check(`${name} no network`, false, `found: ${foundOffense}`);
    }
  } else {
    check(`${name} no network`, true);
  }
}

// --- Allowlist sanity: confirm the EXPECTED network-using scripts are NOT in NO_NETWORK_SCRIPTS ---
console.log('\n--- Allowlist sanity ---');
{
  const ALLOWED_NETWORK = ['license-check.js', 'update.js', 'lib/http-probe.js'];
  for (const name of ALLOWED_NETWORK) {
    const path = join(ROBOS_ROOT, 'scripts', name);
    try {
      const src = readFileSync(path, 'utf-8');
      const usesNetwork = NETWORK_PATTERNS.some(p => p.test(src));
      check(`${name} uses network (expected — gated exception)`, usesNetwork);
    } catch {
      // file missing — that's fine, we just won't assert
    }
  }
}

console.log('\n=========================');
console.log(`PASSED: ${pass}`);
console.log(`FAILED: ${fail}`);
console.log('=========================');
process.exit(fail > 0 ? 1 : 0);
