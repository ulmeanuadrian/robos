#!/usr/bin/env node
/**
 * smoke-license-perf.js — Pin LIC-3 + PRF-2 (license check < 10ms typical, < 100ms p95).
 *
 * Why this matters: licenseCheck runs on EVERY user prompt via hook-user-prompt.js.
 * Hook timeout is 5s. If license check ever creeps to 100ms+ (file IO regression,
 * crypto API change, network call in hot path), prompt latency suffers AND the
 * hook risks timing out under load.
 *
 * Strategy:
 *   1. Import checkLicense from license-check.js
 *   2. Warm-up: 1 call (loads modules, primes file cache, may fire background refresh)
 *   3. Time N=100 sequential invocations with high-res clock
 *   4. Report p50/p95/p99/max
 *   5. Assert p95 < 100ms (10x the claimed ~5ms — accommodates slow disk + AV)
 *
 * Skip conditions:
 *   - ~/.robos/license.jwt missing → dev machine without bind, skip with note
 *   - Network call required (no JWT, no .license-stamp) → would be slow + non-deterministic
 *
 * Exit: 0 on green or skip; 1 if perf budget exceeded.
 */

import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
import { performance } from 'node:perf_hooks';

const __filename = fileURLToPath(import.meta.url);
const ROBOS_ROOT = join(dirname(__filename), '..');

const JWT_PATH = join(homedir(), '.robos', 'license.jwt');
const ITERATIONS = 100;

// Budgets (ms)
const P95_BUDGET_MS = 100;
const MAX_BUDGET_MS = 500;

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

async function main() {
  console.log('--- license-check perf ---');

  if (!existsSync(JWT_PATH)) {
    console.log(`  SKIP  ${JWT_PATH} not found (dev machine without bind)`);
    console.log('        License check would do bind/network call — perf test invalid.');
    console.log('        Run: node scripts/setup.js (with internet) to bind, then re-run smoke.');
    process.exit(0);
  }

  const checkScript = join(ROBOS_ROOT, 'scripts', 'license-check.js');
  if (!existsSync(checkScript)) {
    console.log(`  FAIL  license-check.js missing at ${checkScript}`);
    process.exit(1);
  }

  const mod = await import(pathToFileURL(checkScript).href);
  if (typeof mod.checkLicense !== 'function') {
    console.log('  FAIL  checkLicense export missing');
    process.exit(1);
  }

  // Warm-up — first call primes file cache + module init.
  const warm = await mod.checkLicense(ROBOS_ROOT);
  check('warm-up call returns ok', warm.ok === true, `got ${JSON.stringify(warm)}`);

  if (!warm.ok) {
    console.log('  SKIP  License invalid on this host — perf test deferred.');
    console.log('        Fix license state, then re-run smoke.');
    process.exit(0);
  }

  // Time N invocations
  const samples = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const t0 = performance.now();
    const r = await mod.checkLicense(ROBOS_ROOT);
    const t1 = performance.now();
    if (!r.ok) {
      fail++;
      console.log(`  FAIL  iteration ${i} returned !ok: ${JSON.stringify(r)}`);
      break;
    }
    samples.push(t1 - t0);
  }

  if (samples.length !== ITERATIONS) {
    console.log(`  FAIL  only ${samples.length}/${ITERATIONS} iterations completed`);
    process.exit(1);
  }

  samples.sort((a, b) => a - b);
  const p50 = percentile(samples, 50);
  const p95 = percentile(samples, 95);
  const p99 = percentile(samples, 99);
  const max = samples[samples.length - 1];

  console.log('');
  console.log(`  Iterations: ${ITERATIONS}`);
  console.log(`  p50:  ${p50.toFixed(2)}ms`);
  console.log(`  p95:  ${p95.toFixed(2)}ms`);
  console.log(`  p99:  ${p99.toFixed(2)}ms`);
  console.log(`  max:  ${max.toFixed(2)}ms`);
  console.log('');

  check(
    `p95 < ${P95_BUDGET_MS}ms`,
    p95 < P95_BUDGET_MS,
    `actual ${p95.toFixed(2)}ms — license check is in hot path; investigate if it crept`
  );
  check(
    `max < ${MAX_BUDGET_MS}ms`,
    max < MAX_BUDGET_MS,
    `actual ${max.toFixed(2)}ms — single outlier could indicate accidental network call`
  );

  console.log('\n=========================');
  console.log(`PASSED: ${pass}`);
  console.log(`FAILED: ${fail}`);
  console.log('=========================');
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  if (process.env.DEBUG) console.error(e.stack);
  process.exit(1);
});
