#!/usr/bin/env node
/**
 * smoke-cron-log-rotation.js — Pin SCA-5 (cron/logs/ retention).
 *
 * Verifies that `pruneDirByAge` correctly removes old `.log` files from the
 * cron/logs/ directory. The actual cleanup wires into session-timeout-detector
 * (runs every 15 min via cron); this smoke pins the algorithm.
 *
 * Strategy:
 *   1. tmp dir mimicking cron/logs/
 *   2. seed fresh + old `.log` files (touch mtime to past)
 *   3. seed unrelated files (.txt) to confirm predicate filter
 *   4. run pruneDirByAge with predicate `.log` only
 *   5. assert old `.log` removed, fresh `.log` kept, unrelated files untouched
 */

import {
  existsSync, mkdirSync, rmSync, writeFileSync, readdirSync, utimesSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { pruneDirByAge } from './lib/cleanup.js';

const __filename = fileURLToPath(import.meta.url);

let pass = 0;
let fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`); }
}

console.log('--- cron/logs/ rotation ---');

const TMP = join(tmpdir(), `robos-cron-logs-${process.pid}-${Date.now()}`);
mkdirSync(TMP, { recursive: true });

try {
  const now = Date.now();
  const FRESH_AGE_DAYS = 1;
  const OLD_AGE_DAYS = 30;
  const RETENTION_DAYS = 14;

  // Fresh logs (1 day old) — should be KEPT
  const fresh = ['session-timeout-1.log', 'audit-startup-1.log'];
  for (const name of fresh) {
    const path = join(TMP, name);
    writeFileSync(path, 'fresh\n');
    const t = (now - FRESH_AGE_DAYS * 86400_000) / 1000;
    utimesSync(path, t, t);
  }

  // Old logs (30 days old) — should be REMOVED
  const old = ['session-timeout-99.log', 'audit-startup-99.log', 'cleanup-1.log'];
  for (const name of old) {
    const path = join(TMP, name);
    writeFileSync(path, 'old\n');
    const t = (now - OLD_AGE_DAYS * 86400_000) / 1000;
    utimesSync(path, t, t);
  }

  // Old non-.log files (e.g. .pid, .txt) — should be KEPT (predicate filter)
  const nonLog = ['daemon.pid', 'README.txt'];
  for (const name of nonLog) {
    const path = join(TMP, name);
    writeFileSync(path, 'data\n');
    const t = (now - OLD_AGE_DAYS * 86400_000) / 1000;
    utimesSync(path, t, t);
  }

  // Run prune with `.log` predicate (matches session-timeout-detector usage)
  const result = pruneDirByAge(TMP, RETENTION_DAYS, {
    predicate: (name) => name.endsWith('.log'),
  });

  check('removed exactly the old .log files',
    result.removed === old.length,
    `expected ${old.length}, got ${result.removed}`);
  check('zero errors', result.errors === 0);

  // Verify state on disk
  const remaining = new Set(readdirSync(TMP));

  for (const name of fresh) {
    check(`fresh log preserved: ${name}`, remaining.has(name));
  }
  for (const name of old) {
    check(`old log removed: ${name}`, !remaining.has(name));
  }
  for (const name of nonLog) {
    check(`non-log preserved (predicate filter): ${name}`, remaining.has(name));
  }

  // Sanity: total count is fresh + nonLog
  check('final count matches fresh + non-log',
    remaining.size === fresh.length + nonLog.length,
    `expected ${fresh.length + nonLog.length}, got ${remaining.size}`);
} finally {
  rmSync(TMP, { recursive: true, force: true });
}

// --- Test 2: session-timeout-detector wires cron-logs prune ---
console.log('\n--- session-timeout-detector source check ---');
{
  const ROBOS_ROOT = join(dirname(__filename), '..');
  const src = (await import('node:fs')).readFileSync(
    join(ROBOS_ROOT, 'scripts', 'session-timeout-detector.js'),
    'utf-8'
  );
  check(
    'session-timeout-detector calls pruneDirByAge on cron/logs',
    /cron.*logs.*pruneDirByAge|cronLogsDir|pruneDirByAge\(.*cron.*logs/.test(src) ||
      /cron[/\\]logs/.test(src) && /pruneDirByAge/.test(src),
    'cleanup not wired — old logs will accumulate forever'
  );
  check(
    'predicate restricts to .log files',
    /predicate.*name\.endsWith\(['"`]\.log['"`]\)/.test(src),
    'without predicate, non-log files (e.g. .pid) would be removed'
  );
}

console.log('\n=========================');
console.log(`PASSED: ${pass}`);
console.log(`FAILED: ${fail}`);
console.log('=========================');
process.exit(fail > 0 ? 1 : 0);
