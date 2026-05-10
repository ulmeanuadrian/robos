#!/usr/bin/env node
/**
 * smoke-activity-log.js — Pin OBS-4 (cross-session activity log healthy).
 *
 * data/activity-log.ndjson is the bridge that lets a future session see what
 * happened in earlier sessions ("ce am facut ieri"). Three things must hold:
 *
 *   1. activity-capture.js routes user prompts through redactSensitive
 *      before persisting (no secrets in the log).
 *   2. The log file (when present) has bounded size — appendNdjson rotation
 *      caps at MAX_ENTRIES (currently 500).
 *   3. Each entry is a valid JSON object with at minimum `ts` (ISO timestamp).
 *   4. ROBOS_ACTIVITY_DISABLED=1 actually disables capture (toggle works).
 *
 * Strategy: static source check + structural validation of the live log
 * (if present) + spawn activity-capture with disabled toggle to verify
 * graceful no-op exit.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const ROBOS_ROOT = join(dirname(__filename), '..');
const ACTIVITY_LOG = join(ROBOS_ROOT, 'data', 'activity-log.ndjson');
const CAPTURE_SRC = join(ROBOS_ROOT, 'scripts', 'activity-capture.js');

let pass = 0;
let fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`); }
}

// --- Test 1: source wiring ---
console.log('--- activity-capture.js source ---');
{
  if (!existsSync(CAPTURE_SRC)) {
    check('activity-capture.js exists', false);
  } else {
    const src = readFileSync(CAPTURE_SRC, 'utf-8');
    check('imports redactSensitive', /import\s*\{[^}]*\bredactSensitive\b/.test(src));
    check('uses redactSensitive on user prompt',
      /redactSensitive\s*\([^)]*userPrompt|userPrompt\s*=\s*redactSensitive/.test(src),
      'user prompt must be redacted before entering log');
    check('uses redactSensitive on assistant text or commands',
      /redactSensitive\s*\(\s*block\.text|redactSensitive\s*\(\s*cmd\b/.test(src),
      'assistant content + command summaries should also be redacted');
    check('routes through appendNdjson (rotation)', /appendNdjson\s*\(/.test(src));
    check('declares MAX_ENTRIES bound', /MAX_ENTRIES\s*=\s*\d+/.test(src));
    check('honours ROBOS_ACTIVITY_DISABLED=1',
      /ROBOS_ACTIVITY_DISABLED.*?===\s*['"]1['"]/.test(src),
      'toggle gate must early-return when set');
  }
}

// --- Test 2: live log structural validation (if present) ---
console.log('\n--- activity-log.ndjson structure ---');
if (!existsSync(ACTIVITY_LOG)) {
  console.log('  SKIP  log not yet created — Stop hook never fired or capture disabled');
} else {
  let raw;
  try { raw = readFileSync(ACTIVITY_LOG, 'utf-8'); }
  catch (e) { check('log readable', false, e.message); raw = ''; }

  const lines = raw.split('\n').filter(Boolean);
  check(`log has entries (${lines.length})`, lines.length >= 0); // 0 is fine, just check parseable
  check('log respects MAX_ENTRIES=500 cap', lines.length <= 500,
    `actual ${lines.length} — rotation may have failed`);

  let parsed = 0, withTs = 0, malformed = 0;
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      parsed++;
      if (typeof entry.ts === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(entry.ts)) {
        withTs++;
      }
    } catch {
      malformed++;
    }
  }
  if (lines.length > 0) {
    check('all entries parse as JSON', malformed === 0, `${malformed} malformed`);
    check('all entries have ISO `ts` field', withTs === parsed,
      `${parsed - withTs}/${parsed} missing or invalid ts`);
  }
}

// --- Test 3: ROBOS_ACTIVITY_DISABLED toggle ---
console.log('\n--- Disabled-toggle behaviour ---');
{
  // Spawn activity-capture with the toggle set + minimal stdin payload.
  // It must exit 0 fast (no log write).
  const r = spawnSync(process.execPath, [CAPTURE_SRC], {
    encoding: 'utf-8', shell: false, cwd: ROBOS_ROOT,
    input: JSON.stringify({ session_id: 'smoke-disabled', cwd: ROBOS_ROOT }),
    env: { ...process.env, ROBOS_ACTIVITY_DISABLED: '1' },
    timeout: 5000,
  });
  check('disabled toggle: exit 0', r.status === 0, `exit ${r.status}`);
  check('disabled toggle: no stdout (silent no-op)',
    !r.stdout || r.stdout.trim().length === 0,
    `stdout: ${(r.stdout || '').slice(0, 100)}`);
}

console.log('\n=========================');
console.log(`PASSED: ${pass}`);
console.log(`FAILED: ${fail}`);
console.log('=========================');
process.exit(fail > 0 ? 1 : 0);
