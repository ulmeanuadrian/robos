#!/usr/bin/env node
/**
 * smoke-claims-coverage.js — Pin DOC-1 (path-like references in docs exist).
 *
 * Runs lint-claims on the canonical doc set and asserts 0 missing paths.
 * Catches:
 *   - Typos: `scripts/setup.j` (missing `s`)
 *   - Stale references after rename/delete
 *   - Hallucinated paths in copy/positioning/CHANGELOG entries
 *
 * Tolerates:
 *   - Runtime-created paths via lint-claims `RUNTIME_FILES` + `RUNTIME_PREFIXES`
 *     (data/hook-errors.ndjson, projects/*, clients/*, etc.)
 *   - Placeholders ({slug}, YYYY-MM-DD)
 */

import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const ROBOS_ROOT = join(dirname(__filename), '..');

let pass = 0;
let fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`); }
}

// Canonical doc set — every doc that students/operators consume should pass.
const DOCS = [
  'AGENTS.md',
  'CLAUDE.md',
  'README.md',
  'WHATS-NEW.md',
  'docs/INSTALL.md',
];

console.log(`--- lint-claims on ${DOCS.length} canonical docs ---`);

const existingDocs = DOCS.filter(d => existsSync(join(ROBOS_ROOT, d)));
if (existingDocs.length === 0) {
  console.log('  FAIL  no canonical docs found');
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  [join(ROBOS_ROOT, 'scripts', 'lint-claims.js'), ...existingDocs],
  { cwd: ROBOS_ROOT, encoding: 'utf-8', shell: false }
);

// Print lint-claims output for visibility
process.stdout.write(result.stdout || '');
if (result.stderr) process.stderr.write(result.stderr);

check(`lint-claims exit 0 (no MISSING in ${existingDocs.length} docs)`,
  result.status === 0,
  `exit ${result.status} — at least one doc has a missing path reference`);

// Parse summary line for additional sanity assertions.
const summaryMatch = (result.stdout || '').match(/Total: (\d+) \| Verified: (\d+) \| Placeholder: (\d+) \| Runtime: (\d+) \| Missing: (\d+)/);
if (summaryMatch) {
  const [, total, verified, placeholder, runtime, missing] = summaryMatch.map(Number);
  check(`Missing count = 0`, missing === 0, `got ${missing}`);
  check(`Verified count > 50 (sanity — docs reference real files)`,
    verified > 50, `got ${verified}, suspicious if too low`);
  check(`Total references > 100 (sanity — docs are non-empty)`,
    total > 100, `got ${total}`);
}

console.log('\n=========================');
console.log(`PASSED: ${pass}`);
console.log(`FAILED: ${fail}`);
console.log('=========================');
process.exit(fail > 0 ? 1 : 0);
