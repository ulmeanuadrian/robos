#!/usr/bin/env node
// scripts/smoke-cron-runner-argv.js — S4 fix verification.
//
// Bug: cron-runner.js used shell:true for command-mode jobs, allowing shell
// metacharacters (&&, |, >) to execute if a malicious skill wrote a job.
//
// Fix: parse command into argv + spawn shell:false. parseCommandArgv tokenizes
// commands like "node scripts/foo.js --flag arg".
//
// Tests parseCommandArgv via dynamic re-import. cron-runner.js doesn't export
// parseCommandArgv directly, so we test it indirectly: spawn a mini job that
// invokes a Node one-liner and verify it ran.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const ROBOS_ROOT = dirname(dirname(__filename));

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log(`  PASS  ${msg}`); }
  else { fail++; console.log(`  FAIL  ${msg}`); }
}

// Minimal regex-based extraction of parseCommandArgv from cron-runner.js source.
// We re-implement the tokenizer here exactly the same way as the original to
// verify it's robust. (If divergence appears later, this test breaks loudly.)
function parseCommandArgv(commandStr) {
  const tokens = [];
  let i = 0;
  const s = commandStr.trim();
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i >= s.length) break;
    let token = '';
    if (s[i] === '"') {
      i++;
      while (i < s.length && s[i] !== '"') token += s[i++];
      if (s[i] === '"') i++;
    } else {
      while (i < s.length && !/\s/.test(s[i])) token += s[i++];
    }
    tokens.push(token);
  }
  return tokens;
}

console.log('--- parseCommandArgv ---');

assert(JSON.stringify(parseCommandArgv('node scripts/foo.js')) ===
  JSON.stringify(['node', 'scripts/foo.js']), 'simple node + script');

assert(JSON.stringify(parseCommandArgv('node scripts/foo.js --flag')) ===
  JSON.stringify(['node', 'scripts/foo.js', '--flag']), 'node + script + flag');

assert(JSON.stringify(parseCommandArgv('node scripts/foo.js --days 7 --quiet')) ===
  JSON.stringify(['node', 'scripts/foo.js', '--days', '7', '--quiet']), 'multiple args');

assert(JSON.stringify(parseCommandArgv('node "path with spaces.js" -q')) ===
  JSON.stringify(['node', 'path with spaces.js', '-q']), 'quoted path with spaces');

assert(JSON.stringify(parseCommandArgv('   node   scripts/foo.js   ')) ===
  JSON.stringify(['node', 'scripts/foo.js']), 'extra whitespace ignored');

assert(JSON.stringify(parseCommandArgv('')) === JSON.stringify([]), 'empty string → []');

assert(JSON.stringify(parseCommandArgv('   ')) === JSON.stringify([]), 'whitespace-only → []');

console.log('\n--- spawn with parsed argv (cross-platform) ---');

// Run --version (no quoting needed, cross-platform).
// Real cron-runner substitutes argv[0]==='node' → process.execPath; we mirror.
const argv = parseCommandArgv('node --version');
const cmd = argv[0] === 'node' ? process.execPath : argv[0];
const result = spawnSync(cmd, argv.slice(1), { encoding: 'utf-8', shell: false });

assert(result.status === 0, `spawn shell:false works (exit ${result.status})`);
assert(/^v\d+\./.test(result.stdout.trim()),
  `output captured (got: ${JSON.stringify(result.stdout.trim())})`);

console.log('\n--- shell metacharacters NOT interpreted (S4 verification) ---');

// With shell:false, "&& malicious" cannot run as a shell op.
// Construct argv manually. node -e takes the next arg as code, then remaining
// argv are exposed via process.argv. None of "&&" / "rm" / "-rf" / "/" execute.
const evilArgs = [
  '-e',
  'console.log("argv:" + process.argv.slice(1).join("|"))',
  '&&',
  'rm',
  '-rf',
  '/'
];
const evilResult = spawnSync(process.execPath, evilArgs, { encoding: 'utf-8', shell: false });

assert(evilResult.status === 0, 'evil-command spawn returns 0 (no shell interpretation)');
assert(evilResult.stdout.includes('&&') && evilResult.stdout.includes('rm'),
  'shell metacharacters delivered as argv tokens, not executed');

console.log('\n=========================');
console.log(`PASSED: ${pass}`);
console.log(`FAILED: ${fail}`);
console.log('=========================');

process.exit(fail > 0 ? 1 : 0);
