#!/usr/bin/env node
/**
 * smoke-hook-latency.js — Pin PRF-1 (hooks finalizeaza sub timeout).
 *
 * .claude/settings.json declares timeouts for each hook:
 *   UserPromptSubmit: 5s
 *   Stop (3 hooks):   5s/3s/5s
 *   PostToolUse:      3s
 *
 * If a hook exceeds its timeout, Claude Code kills it mid-execution → state
 * corruption (e.g., partial atomic write rolled back, but also possible to
 * wedge mid-rename on Windows EBUSY). Budget: p95 < 500ms (10% of 5s) per
 * hook, with hard cap < 2000ms (40% of 5s — anything more = investigate).
 *
 * Strategy: spawn each hook with mock JSON payload via stdin, time the
 * round-trip, repeat N=10 (modest — hooks aren't super hot but each launch
 * costs ~50ms node startup baseline).
 *
 * This smoke does NOT exercise heavy code paths (e.g., big memory file
 * scanning). It measures the BASELINE hook overhead. Real-world load (large
 * memory, many active sessions) may push hooks higher; this baseline being
 * green means the hook architecture is healthy.
 */

import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const __filename = fileURLToPath(import.meta.url);
const ROBOS_ROOT = join(dirname(__filename), '..');

const ITERATIONS = 10;
const P95_BUDGET_MS = 500;
const MAX_BUDGET_MS = 2000;

let pass = 0;
let fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`); }
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

// Mock payload Claude Code sends to hooks. Minimal but realistic.
const MOCK_USER_PROMPT_PAYLOAD = JSON.stringify({
  session_id: 'smoke-hook-latency',
  prompt: 'hello',
  cwd: ROBOS_ROOT,
});

const MOCK_STOP_PAYLOAD = JSON.stringify({
  session_id: 'smoke-hook-latency',
  cwd: ROBOS_ROOT,
});

const MOCK_POST_TOOL_PAYLOAD = JSON.stringify({
  session_id: 'smoke-hook-latency',
  tool_name: 'Read',
  tool_input: { file_path: 'README.md' },
  tool_response: { content: 'fixture' },
});

const HOOKS = [
  { name: 'hook-user-prompt.js', payload: MOCK_USER_PROMPT_PAYLOAD, timeoutSec: 5 },
  { name: 'hook-post-tool.js',   payload: MOCK_POST_TOOL_PAYLOAD,   timeoutSec: 3 },
  { name: 'checkpoint-reminder.js', payload: MOCK_STOP_PAYLOAD,     timeoutSec: 3 },
  { name: 'activity-capture.js', payload: MOCK_STOP_PAYLOAD,        timeoutSec: 5 },
  { name: 'note-candidates.js',  payload: MOCK_STOP_PAYLOAD,        timeoutSec: 5 },
];

function runHook(scriptPath, payload) {
  const t0 = performance.now();
  const result = spawnSync(process.execPath, [scriptPath], {
    input: payload,
    encoding: 'utf-8',
    shell: false,
    cwd: ROBOS_ROOT,
    timeout: 10_000, // hard kill if hook truly hangs (would mask real issue but bounds smoke)
  });
  const t1 = performance.now();
  return { durationMs: t1 - t0, status: result.status, error: result.error };
}

console.log('--- Hook latency baseline ---');
console.log('');

for (const hook of HOOKS) {
  const path = join(ROBOS_ROOT, 'scripts', hook.name);
  // Warm-up (first launch primes the OS file cache for node + script)
  runHook(path, hook.payload);

  const samples = [];
  let exitCodes = new Set();
  let errors = 0;
  for (let i = 0; i < ITERATIONS; i++) {
    const r = runHook(path, hook.payload);
    if (r.error) errors++;
    if (r.status !== null) exitCodes.add(r.status);
    samples.push(r.durationMs);
  }

  samples.sort((a, b) => a - b);
  const p50 = percentile(samples, 50);
  const p95 = percentile(samples, 95);
  const max = samples[samples.length - 1];

  console.log(`  ${hook.name} (timeout ${hook.timeoutSec}s):`);
  console.log(`    p50: ${p50.toFixed(0)}ms  p95: ${p95.toFixed(0)}ms  max: ${max.toFixed(0)}ms  exit: [${[...exitCodes].join(',')}]`);

  check(`${hook.name} p95 < ${P95_BUDGET_MS}ms`, p95 < P95_BUDGET_MS, `actual ${p95.toFixed(0)}ms`);
  check(`${hook.name} max < ${MAX_BUDGET_MS}ms`, max < MAX_BUDGET_MS, `actual ${max.toFixed(0)}ms`);
  check(`${hook.name} no spawn errors`, errors === 0, `${errors}/${ITERATIONS}`);
  // Hooks should exit 0 — they don't block the user even on internal errors.
  check(`${hook.name} exits 0`, exitCodes.size === 1 && exitCodes.has(0),
    `exit codes: [${[...exitCodes].join(',')}]`);
}

console.log('\n=========================');
console.log(`PASSED: ${pass}`);
console.log(`FAILED: ${fail}`);
console.log('=========================');
process.exit(fail > 0 ? 1 : 0);
