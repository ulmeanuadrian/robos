#!/usr/bin/env node
// scripts/smoke-cleanup.js — F5/F10 verification: pruneDirByAge.
//
// Tests scripts/lib/cleanup.js: removes old files by mtime, keeps fresh
// files, respects predicate, handles missing dir, errors counted.

import { writeFileSync, existsSync, mkdirSync, rmSync, utimesSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pruneDirByAge } from './lib/cleanup.js';

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log(`  PASS  ${msg}`); }
  else { fail++; console.log(`  FAIL  ${msg}`); }
}

const TEST_DIR = join(tmpdir(), `robos-cleanup-${process.pid}-${Date.now()}`);
mkdirSync(TEST_DIR, { recursive: true });

function ageFile(name, daysOld, content = 'x') {
  const path = join(TEST_DIR, name);
  writeFileSync(path, content, 'utf-8');
  if (daysOld > 0) {
    const t = (Date.now() - daysOld * 86400_000) / 1000;
    utimesSync(path, t, t);
  }
  return path;
}

console.log('--- basic age-based pruning ---');
{
  ageFile('old-1.txt', 40);
  ageFile('old-2.txt', 35);
  ageFile('fresh-1.txt', 5);
  ageFile('fresh-2.txt', 0);

  const result = pruneDirByAge(TEST_DIR, 30);
  assert(result.removed === 2, `removed 2 old files (got ${result.removed})`);
  assert(result.kept === 2, `kept 2 fresh files (got ${result.kept})`);
  assert(result.errors === 0, 'no errors');
  assert(!existsSync(join(TEST_DIR, 'old-1.txt')), 'old-1.txt unlinked');
  assert(existsSync(join(TEST_DIR, 'fresh-1.txt')), 'fresh-1.txt preserved');

  // cleanup
  rmSync(join(TEST_DIR, 'fresh-1.txt'), { force: true });
  rmSync(join(TEST_DIR, 'fresh-2.txt'), { force: true });
}

console.log('\n--- predicate filter ---');
{
  ageFile('a-old.json', 40);
  ageFile('b-old.txt', 40);
  ageFile('c-old.bak', 40);

  // Only prune .json files
  const result = pruneDirByAge(TEST_DIR, 30, {
    predicate: (name) => name.endsWith('.json'),
  });
  assert(result.removed === 1, `predicate removed 1 file (got ${result.removed})`);
  assert(result.kept === 2, `predicate kept 2 files (got ${result.kept})`);
  assert(!existsSync(join(TEST_DIR, 'a-old.json')), '.json unlinked');
  assert(existsSync(join(TEST_DIR, 'b-old.txt')), '.txt kept');
  assert(existsSync(join(TEST_DIR, 'c-old.bak')), '.bak kept');

  rmSync(join(TEST_DIR, 'b-old.txt'), { force: true });
  rmSync(join(TEST_DIR, 'c-old.bak'), { force: true });
}

console.log('\n--- missing directory: graceful ---');
{
  const missing = join(TEST_DIR, 'does-not-exist');
  const result = pruneDirByAge(missing, 30);
  assert(result.removed === 0 && result.kept === 0 && result.errors === 0,
    'missing dir → all zeros, no throw');
}

console.log('\n--- skips subdirectories ---');
{
  mkdirSync(join(TEST_DIR, 'subdir'), { recursive: true });
  ageFile('regular.txt', 40);

  // Age the subdir itself by setting mtime
  const t = (Date.now() - 40 * 86400_000) / 1000;
  utimesSync(join(TEST_DIR, 'subdir'), t, t);

  const result = pruneDirByAge(TEST_DIR, 30);
  assert(result.removed === 1, 'removed 1 regular file');
  assert(result.kept === 1, 'kept 1 (the subdirectory)');
  assert(existsSync(join(TEST_DIR, 'subdir')), 'subdirectory NOT removed');

  rmSync(join(TEST_DIR, 'subdir'), { recursive: true, force: true });
}

console.log('\n--- empty directory ---');
{
  const result = pruneDirByAge(TEST_DIR, 30);
  assert(result.removed === 0 && result.kept === 0 && result.errors === 0,
    'empty dir → all zeros');
}

rmSync(TEST_DIR, { recursive: true, force: true });

console.log('\n=========================');
console.log(`PASSED: ${pass}`);
console.log(`FAILED: ${fail}`);
console.log('=========================');

process.exit(fail > 0 ? 1 : 0);
