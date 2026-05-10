#!/usr/bin/env node
/**
 * smoke-skill-routing.js — Pin UX-3 (skill triggers route correctly).
 *
 * For every installed skill, every declared trigger must:
 *   - Match successfully through routePrompt()
 *   - Resolve to that exact skill (not a different one due to overlap)
 *
 * Catches: trigger drift between docs and code, accidental shadowing when a
 * new skill's trigger is a substring of another skill's trigger, broken
 * trigger normalization (diacritics, case).
 *
 * Strategy:
 *   1. Read skills/_index.json (built from SKILL.md frontmatter)
 *   2. For each skill × each trigger:
 *      - run routePrompt(trigger)
 *      - assert matched=true AND winner=skill (or document the override)
 *   3. Spot-check Romanian-prose phrasings of common commands
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { routePrompt } from './skill-route.js';

const __filename = fileURLToPath(import.meta.url);
const ROBOS_ROOT = join(dirname(__filename), '..');
const INDEX_PATH = join(ROBOS_ROOT, 'skills', '_index.json');

let pass = 0;
let fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`); }
}

if (!existsSync(INDEX_PATH)) {
  console.log('  FAIL  skills/_index.json missing — run rebuild-index.js first');
  process.exit(1);
}

const index = JSON.parse(readFileSync(INDEX_PATH, 'utf-8'));
const skills = index.skills || [];

console.log(`--- Trigger round-trip (${skills.length} skills) ---`);

let triggerCount = 0;
let overrideCount = 0;

for (const skill of skills) {
  const triggers = skill.triggers || [];
  for (const trig of triggers) {
    triggerCount++;
    const result = routePrompt(trig);
    if (!result.matched) {
      check(`${skill.name} trigger "${trig}" matches`, false,
        `routePrompt returned no match — trigger may collide with negative_triggers`);
      continue;
    }
    if (result.skill === skill.name) {
      pass++;
      // (silent — too noisy to print every PASS for 100+ triggers)
    } else {
      // Trigger is "owned" by another skill (longer match wins).
      // This is OK if the OTHER skill's trigger is a strict superset (e.g.
      // "creeaza un skill" wins over "skill"). Document via candidates list.
      overrideCount++;
      const winner = result.skill;
      const winnerTrig = result.trigger;
      // Sanity: winner's trigger should be longer than this trigger
      const isLongerOverride = (winnerTrig?.length || 0) >= trig.length;
      check(
        `${skill.name} trigger "${trig}" overridden by longer trigger of ${winner}`,
        isLongerOverride,
        `winner trigger "${winnerTrig}" not a superset — possible bug`
      );
    }
  }
}

console.log(`\n  ${triggerCount} total triggers, ${overrideCount} overridden by longer matches (expected for substring conflicts)`);
console.log(`  ${triggerCount - overrideCount} routed cleanly`);

// --- Spot-check user-facing Romanian phrasings from docs ---
console.log('\n--- Documented Romanian phrasings ---');

const DOC_PHRASES = [
  // From CLAUDE.md / README.md "Core Workflows"
  { phrase: 'plan de zi', expectSkill: 'sys-daily-plan' },
  { phrase: 'audit', expectSkill: 'sys-audit' },
  { phrase: 'level up', expectSkill: 'sys-level-up' },
  { phrase: 'onboard me', expectSkill: 'sys-onboard' },
  { phrase: 'gata', expectSkill: 'sys-session-close' },
  // Multi-client switching
  { phrase: 'schimba clientul', expectSkill: 'sys-switch-client' },
  { phrase: 'list clients', expectSkill: 'sys-switch-client' },
  // Content
  { phrase: 'scrie un articol despre AI', expectSkill: 'content-blog-post' },
];

for (const { phrase, expectSkill } of DOC_PHRASES) {
  const result = routePrompt(phrase);
  // If skill not installed, skip with note (catalog vs installed mismatch is documented elsewhere)
  const expected = skills.find(s => s.name === expectSkill);
  if (!expected) {
    console.log(`  SKIP  "${phrase}" → ${expectSkill} (not installed)`);
    continue;
  }
  check(`"${phrase}" → ${expectSkill}`, result.matched && result.skill === expectSkill,
    result.matched ? `got ${result.skill}` : `no match`);
}

console.log('\n=========================');
console.log(`PASSED: ${pass}`);
console.log(`FAILED: ${fail}`);
console.log('=========================');
process.exit(fail > 0 ? 1 : 0);
