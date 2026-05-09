#!/usr/bin/env node
// scripts/smoke-all.js — Ruleaza toate smoke-*.js in O(1) comanda.
//
// Cross-platform: Node only, fara shell. Foloseste process.execPath.
// Output: tabel cu PASS/FAIL per suite + exit code 0 daca toate trec, 1 altfel.
//
// Usage:
//   node scripts/smoke-all.js              # ruleaza tot
//   node scripts/smoke-all.js --quick      # exclude smoke-uri lente (>5s)
//   node scripts/smoke-all.js --verbose    # output complet din fiecare smoke

import { readdirSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const QUICK = process.argv.includes('--quick');
const VERBOSE = process.argv.includes('--verbose');

// Smoke tests considered "slow" (skipped in --quick mode)
const SLOW_TESTS = new Set([
  // (gol acum — adauga aici cand un smoke depaseste 5s)
]);

function findSmokeTests() {
  const tests = [];
  for (const name of readdirSync(__dirname)) {
    if (!name.startsWith('smoke-') || !name.endsWith('.js')) continue;
    if (name === basename(__filename)) continue; // exclude smoke-all itself
    if (QUICK && SLOW_TESTS.has(name)) continue;
    const path = join(__dirname, name);
    if (statSync(path).isFile()) tests.push({ name, path });
  }
  return tests.sort((a, b) => a.name.localeCompare(b.name));
}

function runSmoke(test) {
  const start = performance.now();
  const result = spawnSync(process.execPath, [test.path], {
    stdio: VERBOSE ? 'inherit' : 'pipe',
    encoding: 'utf8',
    cwd: dirname(__dirname), // ROBOS_ROOT
  });
  const durationMs = Math.round(performance.now() - start);

  return {
    name: test.name,
    pass: result.status === 0,
    durationMs,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error,
  };
}

function summarize(results) {
  const totalPass = results.filter(r => r.pass).length;
  const totalFail = results.length - totalPass;
  const totalMs = results.reduce((sum, r) => sum + r.durationMs, 0);

  console.log('');
  console.log('='.repeat(60));
  console.log(`${totalPass}/${results.length} suites green` +
              (totalFail > 0 ? `  (${totalFail} failed)` : '') +
              `  [${totalMs}ms total]`);
  console.log('='.repeat(60));

  if (totalFail > 0) {
    console.log('');
    console.log('Failed suites:');
    for (const r of results.filter(x => !x.pass)) {
      console.log(`  - ${r.name}`);
      if (!VERBOSE && r.stderr) {
        const tail = r.stderr.trim().split('\n').slice(-5).join('\n    ');
        console.log(`    ${tail}`);
      }
    }
  }
}

function main() {
  const tests = findSmokeTests();
  if (tests.length === 0) {
    console.log('Niciun smoke test gasit in', __dirname);
    process.exit(0);
  }

  console.log(`Running ${tests.length} smoke test(s)${QUICK ? ' (quick mode)' : ''}...`);
  console.log('');

  const results = [];
  for (const test of tests) {
    process.stdout.write(`  ${test.name.padEnd(40)} `);
    const result = runSmoke(test);
    results.push(result);
    const status = result.pass ? 'PASS' : 'FAIL';
    console.log(`${status}  [${result.durationMs}ms]`);
    if (!result.pass && !VERBOSE) {
      const tail = (result.stderr || result.stdout).trim().split('\n').slice(-3);
      for (const line of tail) console.log(`    | ${line}`);
    }
  }

  summarize(results);
  process.exit(results.every(r => r.pass) ? 0 : 1);
}

main();
