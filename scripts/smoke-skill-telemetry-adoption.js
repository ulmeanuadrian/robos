#!/usr/bin/env node
/**
 * smoke-skill-telemetry-adoption.js — Pin OBS-2 (parallel skills emit telemetry).
 *
 * AGENTS.md > Concurrency Patterns > Telemetrie: every skill paralelizat
 * trebuie sa apeleze `parallel-budget log` dupa rulare → linie in
 * `data/skill-telemetry.ndjson`. Without this, weekly review of fallback rate
 * is impossible.
 *
 * Static check: every installed skill that declares `concurrency_pattern` in
 * its SKILL.md frontmatter must reference `parallel-budget` in the body
 * (instructing the executor to call it). Without this reference, the skill
 * runs paralel but skips telemetry → silent drift.
 *
 * Catches: a new parallel skill added without the telemetry hook, OR an
 * existing skill where the telemetry instruction was deleted during a refactor.
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROBOS_ROOT = join(dirname(__filename), '..');
const SKILLS_DIR = join(ROBOS_ROOT, 'skills');

let pass = 0;
let fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`); }
}

function parseFrontmatter(content) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return null;
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^(\w+):\s*(.+)$/);
    if (kv) fm[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '');
  }
  return fm;
}

console.log('--- Parallel skills must reference parallel-budget telemetry ---');

const skillDirs = readdirSync(SKILLS_DIR, { withFileTypes: true })
  .filter(e => e.isDirectory() && !e.name.startsWith('_'))
  .map(e => e.name);

let parallelSkillCount = 0;

for (const skillName of skillDirs) {
  const skillMd = join(SKILLS_DIR, skillName, 'SKILL.md');
  if (!existsSync(skillMd)) continue;

  const content = readFileSync(skillMd, 'utf-8');
  const fm = parseFrontmatter(content);
  if (!fm) continue;

  const pattern = fm.concurrency_pattern;
  if (!pattern) continue;
  parallelSkillCount++;

  // Skill body must reference parallel-budget log (instructing executor)
  const bodyHasLog = /parallel-budget\.js\s+log\b/.test(content) ||
                    /parallel-budget\s+log\b/.test(content);
  check(
    `${skillName} (pattern=${pattern}) references parallel-budget log`,
    bodyHasLog,
    'skill is paralelizat but does NOT instruct telemetry write — fallback rate unobservable'
  );

  // Skill body should also reference the gating check (parallel-budget check or shouldParallelize)
  const bodyHasCheck = /parallel-budget\.js\s+check\b/.test(content) ||
                       /shouldParallelize\b/.test(content);
  check(
    `${skillName} references parallel-budget check (gating)`,
    bodyHasCheck,
    'skill should gate parallelism via shouldParallelize threshold helper'
  );
}

console.log(`\n  ${parallelSkillCount} parallel skill(s) found and validated.`);

// --- Sanity: telemetry file is appendable + has rotation ---
console.log('\n--- parallel-budget.js source check ---');
{
  const src = readFileSync(join(ROBOS_ROOT, 'scripts', 'parallel-budget.js'), 'utf-8');
  check('parallel-budget.js exports logTelemetry', /export\s+function\s+logTelemetry\b/.test(src));
  check('parallel-budget.js routes through appendNdjson (rotation)', /appendNdjson\(/.test(src));
  check('parallel-budget.js has TELEMETRY_MAX_LINES cap', /TELEMETRY_MAX_LINES\s*=\s*\d+/.test(src));
}

console.log('\n=========================');
console.log(`PASSED: ${pass}`);
console.log(`FAILED: ${fail}`);
console.log('=========================');
process.exit(fail > 0 ? 1 : 0);
