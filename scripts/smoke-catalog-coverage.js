#!/usr/bin/env node
/**
 * smoke-catalog-coverage.js — Pin DOC-3 (catalog entries are installable).
 *
 * Every entry in skills/_catalog/catalog.json with status != "planned" must
 * have either:
 *   - skills/_catalog/{name}/SKILL.md   (installation source for add-skill)
 *   - skills/{name}/SKILL.md            (already installed locally)
 *
 * If a catalog entry has neither, `bash scripts/add-skill.sh <name>` fails
 * with "not found in catalog" → student sees the name in dashboard, tries
 * to install, gets confused.
 *
 * rebuild-index.js prints a [WARN] for orphans on each run (added DOC-3
 * fix). This smoke pins the warning to actually fire when an orphan exists,
 * by injecting a fixture into a tmp catalog and running rebuild-index.
 *
 * Plus: live catalog must have 0 orphans against the current repo.
 */

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const ROBOS_ROOT = join(dirname(__filename), '..');

let pass = 0;
let fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`); }
}

// --- Test 1: live catalog has 0 orphans ---
console.log('--- Live catalog ---');

const catalogPath = join(ROBOS_ROOT, 'skills', '_catalog', 'catalog.json');
const catalog = JSON.parse(readFileSync(catalogPath, 'utf-8'));
const skillsList = Array.isArray(catalog.skills) ? catalog.skills : [];

let liveOrphans = 0;
for (const entry of skillsList) {
  if (!entry || typeof entry.name !== 'string') continue;
  if (entry.status === 'planned') continue;
  const sourceDir = join(ROBOS_ROOT, 'skills', '_catalog', entry.name, 'SKILL.md');
  const installedDir = join(ROBOS_ROOT, 'skills', entry.name, 'SKILL.md');
  const ok = existsSync(sourceDir) || existsSync(installedDir);
  if (!ok) {
    liveOrphans++;
    console.log(`  ORPHAN  ${entry.name}`);
  }
}
check(`live catalog has 0 orphan(s)`, liveOrphans === 0,
  `${liveOrphans} entries with no source AND not status:"planned"`);

// --- Test 2: rebuild-index detects an injected orphan ---
console.log('\n--- Injected orphan detection ---');

const TMP = join(tmpdir(), `robos-catalog-smoke-${process.pid}-${Date.now()}`);
mkdirSync(join(TMP, 'skills', '_catalog'), { recursive: true });
mkdirSync(join(TMP, 'data'), { recursive: true });
mkdirSync(join(TMP, 'scripts'), { recursive: true });
mkdirSync(join(TMP, 'scripts', 'lib'), { recursive: true });

try {
  // Copy required scripts to TMP
  for (const rel of ['rebuild-index.js', 'lib/atomic-write.js', 'lib/skill-frontmatter.js']) {
    copyFileSync(join(ROBOS_ROOT, 'scripts', rel), join(TMP, 'scripts', rel));
  }

  // Inject a catalog with an orphan entry
  const orphanCatalog = {
    version: '0.0.0-smoke',
    skills: [
      { name: 'zz-orphan-skill', category: 'sys', description: 'fixture orphan' },
      { name: 'zz-planned-skill', category: 'sys', description: 'fixture planned', status: 'planned' },
    ],
  };
  writeFileSync(
    join(TMP, 'skills', '_catalog', 'catalog.json'),
    JSON.stringify(orphanCatalog, null, 2)
  );

  // Run rebuild-index in TMP
  const r = spawnSync(process.execPath, [join(TMP, 'scripts', 'rebuild-index.js')], {
    cwd: TMP,
    encoding: 'utf-8',
    shell: false,
  });

  // rebuild-index should still exit 0 (orphans are warning, not error)
  check('rebuild-index exits 0 even with orphans', r.status === 0, `exit ${r.status}`);
  check('rebuild-index prints WARN for orphan', /\[WARN\].*zz-orphan-skill|orphan/i.test(r.stdout + r.stderr),
    'expected WARN line mentioning zz-orphan-skill');
  check('rebuild-index does NOT WARN for planned entry',
    !/zz-planned-skill/i.test(r.stdout + r.stderr) ||
      !/\[WARN\].*zz-planned-skill/i.test(r.stdout + r.stderr),
    'planned entries should be silently OK');
} finally {
  rmSync(TMP, { recursive: true, force: true });
}

console.log('\n=========================');
console.log(`PASSED: ${pass}`);
console.log(`FAILED: ${fail}`);
console.log('=========================');
process.exit(fail > 0 ? 1 : 0);
