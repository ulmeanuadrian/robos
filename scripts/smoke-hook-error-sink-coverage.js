#!/usr/bin/env node
/**
 * smoke-hook-error-sink-coverage.js — Pin OBS-1 (hook + cron error visibility).
 *
 * Hooks exit 0 on error so Claude Code keeps working. Without an error sink,
 * silent failures persist for months (e.g., a malformed _index.json silently
 * disables skill routing forever). This smoke asserts every hook script
 * routes errors through `logHookError` (rotated NDJSON sink).
 *
 * Two tiers:
 *
 *   Hook scripts (CRITICAL — Claude Code invokes; must use logHookError):
 *     - hook-user-prompt.js
 *     - hook-post-tool.js
 *     - checkpoint-reminder.js
 *     - activity-capture.js
 *     - note-candidates.js
 *
 *   Cron scripts (BEST-EFFORT — cron-runner captures stdout to cron/logs/,
 *   so try/catch around main() is enough; logHookError optional):
 *     - audit-startup.js
 *     - session-timeout-detector.js
 *     - learnings-aggregator.js
 *
 * Asserts:
 *   1. Each hook script imports logHookError + calls it in catch.
 *   2. Each cron script wraps main with try/catch OR `.catch()` handler.
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

const HOOK_SCRIPTS = [
  'hook-user-prompt.js',
  'hook-post-tool.js',
  'checkpoint-reminder.js',
  'activity-capture.js',
  'note-candidates.js',
];

const CRON_SCRIPTS = [
  'audit-startup.js',
  'session-timeout-detector.js',
  'learnings-aggregator.js',
];

function readScript(name) {
  return readFileSync(join(ROBOS_ROOT, 'scripts', name), 'utf-8');
}

console.log('--- Hook scripts (must use logHookError) ---');
for (const name of HOOK_SCRIPTS) {
  let src;
  try { src = readScript(name); } catch (e) {
    check(`script exists: ${name}`, false, e.message);
    continue;
  }
  check(`${name} imports logHookError`,
    /import\s*\{[^}]*\blogHookError\b[^}]*\}\s*from\s*['"][^'"]*hook-error-sink[^'"]*['"]/.test(src));
  check(`${name} calls logHookError in catch`,
    /logHookError\s*\(/.test(src) &&
      /\.catch\s*\(\s*[(\w]/.test(src) || /catch\s*\([\w]+\)\s*\{[^}]*logHookError/s.test(src),
    'pattern: top-level main().catch with logHookError, or try/catch wrapping');
}

console.log('\n--- Cron scripts (must have main() error handler) ---');
for (const name of CRON_SCRIPTS) {
  let src;
  try { src = readScript(name); } catch (e) {
    check(`script exists: ${name}`, false, e.message);
    continue;
  }
  // Either: main().catch(...), top-level try/catch in main(), or process.on('uncaughtException')
  const hasMainCatch = /\bmain\(\)\.catch\s*\(/.test(src);
  const hasTryCatch = /\btry\s*\{[\s\S]{20,}\}\s*catch\s*\(/.test(src);
  const hasUncaught = /process\.on\(\s*['"]uncaughtException['"]/.test(src);
  check(
    `${name} has top-level error handler`,
    hasMainCatch || hasTryCatch || hasUncaught,
    'add main().catch(...) or wrap main body in try/catch'
  );
}

// --- Sanity: hook-error-sink.js itself exists and exports logHookError ---
console.log('\n--- hook-error-sink lib ---');
{
  const sinkSrc = readScript('lib/hook-error-sink.js');
  check('lib/hook-error-sink.js exports logHookError',
    /export\s+function\s+logHookError\s*\(/.test(sinkSrc));
  check('lib/hook-error-sink.js writes to data/hook-errors.ndjson',
    /data.*hook-errors\.ndjson/.test(sinkSrc) || /hook-errors\.ndjson/.test(sinkSrc));
  check('lib/hook-error-sink.js uses NDJSON rotation',
    /MAX_LINES|maxLines/.test(sinkSrc));
}

console.log('\n=========================');
console.log(`PASSED: ${pass}`);
console.log(`FAILED: ${fail}`);
console.log('=========================');
process.exit(fail > 0 ? 1 : 0);
