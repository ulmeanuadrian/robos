#!/usr/bin/env node
/**
 * smoke-skills.js
 *
 * Per-skill structural validation. Ruleaza in CI sau manual pentru a verifica
 * ca skill-urile din skills/ respecta contractul robOS:
 *
 *   - SKILL.md exists
 *   - Frontmatter parseaza (no YAML errors)
 *   - Required fields prezente: name, version, category, description, triggers
 *   - category e in VALID_CATEGORIES (WARN daca nu — toleranta la portare)
 *   - tier e in VALID_TIERS daca declarat (WARN daca invalid)
 *   - triggers e non-empty array (FAIL daca skill-ul nu poate fi invocat)
 *   - secrets_required / secrets_optional sunt array daca declarate
 *   - runtime_dependencies sunt array daca declarate
 *   - cross-skill: no trigger collisions (FAIL daca strict)
 *
 * Exit codes:
 *   0  — all skills pass
 *   1  — one or more FAIL conditions
 *
 * CLI:
 *   node scripts/smoke-skills.js              # WARN mode
 *   node scripts/smoke-skills.js --strict     # FAIL pe colizii + categorii invalide
 *   node scripts/smoke-skills.js --skill=X    # validate doar skill-ul X
 */

import { readdirSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  parseFrontmatter,
  normalizeSkillRecord,
  VALID_CATEGORIES,
  VALID_TIERS,
} from './lib/skill-frontmatter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROBOS_ROOT = join(__dirname, '..');
const SKILLS_DIR = join(ROBOS_ROOT, 'skills');

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const skillFilter = args.find((a) => a.startsWith('--skill='))?.split('=')[1];

let failCount = 0;
let warnCount = 0;
const failures = [];
const warnings = [];

function fail(skill, msg) {
  failCount += 1;
  failures.push(`  [FAIL] ${skill}: ${msg}`);
}

function warn(skill, msg) {
  warnCount += 1;
  warnings.push(`  [WARN] ${skill}: ${msg}`);
}

function validateSkill(skillName) {
  const skillDir = join(SKILLS_DIR, skillName);
  const skillMd = join(skillDir, 'SKILL.md');

  if (!existsSync(skillMd)) {
    fail(skillName, 'SKILL.md missing');
    return null;
  }

  let content;
  try {
    content = readFileSync(skillMd, 'utf-8');
  } catch (err) {
    fail(skillName, `cannot read SKILL.md: ${err.message}`);
    return null;
  }

  const fm = parseFrontmatter(content);
  if (!fm || Object.keys(fm).length === 0) {
    fail(skillName, 'frontmatter empty or unparsable');
    return null;
  }

  const record = normalizeSkillRecord(fm, skillName);

  // Required fields
  if (!record.name) fail(skillName, 'missing field: name');
  if (!record.version || record.version === '0.0.0') {
    warn(skillName, 'missing or default version (should be semver, e.g. 1.0.0)');
  }
  if (!record.category || record.category === 'unknown') {
    fail(skillName, 'missing field: category');
  } else if (!VALID_CATEGORIES.includes(record.category)) {
    const msg = `unknown category "${record.category}" (valid: ${VALID_CATEGORIES.join(', ')})`;
    if (strict) fail(skillName, msg);
    else warn(skillName, msg);
  }
  if (!record.description) {
    warn(skillName, 'missing field: description');
  }
  if (!Array.isArray(record.triggers) || record.triggers.length === 0) {
    fail(skillName, 'triggers must be non-empty array (otherwise skill cannot be invoked)');
  }

  // Tier (optional, but if present must be valid)
  if (record.tier && !VALID_TIERS.includes(record.tier)) {
    const msg = `unknown tier "${record.tier}" (valid: ${VALID_TIERS.join(', ')})`;
    if (strict) fail(skillName, msg);
    else warn(skillName, msg);
  }

  // Array field shape
  for (const arrField of ['secrets_required', 'secrets_optional', 'runtime_dependencies', 'negative_triggers', 'context_loads', 'inputs', 'outputs']) {
    if (record[arrField] !== undefined && !Array.isArray(record[arrField])) {
      fail(skillName, `field "${arrField}" must be array if declared`);
    }
  }

  // Naming convention: skill folder should match name
  if (record.name && record.name !== skillName) {
    warn(skillName, `folder name "${skillName}" does not match frontmatter name "${record.name}"`);
  }

  // Prefix should match category (e.g., sys-* skills should have category: sys)
  const prefix = skillName.split('-')[0];
  if (record.category && record.category !== 'unknown' && prefix !== record.category) {
    // Acceptam unele exceptii — ex: meta-skill-creator are category meta, prefix meta. OK.
    // Dar daca prefix=sys si category=tool e probabil greseala.
    if (VALID_CATEGORIES.includes(prefix) && prefix !== record.category) {
      warn(skillName, `prefix "${prefix}" does not match category "${record.category}"`);
    }
  }

  return record;
}

function main() {
  if (!existsSync(SKILLS_DIR)) {
    console.error(`ERROR: skills/ not found at ${SKILLS_DIR}`);
    process.exit(1);
  }

  const entries = readdirSync(SKILLS_DIR, { withFileTypes: true });
  const skillNames = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('_'))
    .map((e) => e.name)
    .filter((name) => !skillFilter || name === skillFilter);

  if (skillNames.length === 0) {
    if (skillFilter) {
      console.error(`ERROR: skill "${skillFilter}" not found in skills/`);
      process.exit(1);
    }
    console.warn('WARN: no skills found in skills/');
    process.exit(0);
  }

  console.log(`Validating ${skillNames.length} skill(s)... (strict=${strict})\n`);

  const records = [];
  for (const name of skillNames) {
    const record = validateSkill(name);
    if (record) records.push(record);
  }

  // Cross-skill: trigger collision check
  const triggerOwners = {}; // normalized trigger → first owner skill
  for (const record of records) {
    for (const trigger of (record.triggers || [])) {
      const key = trigger.toLowerCase().trim();
      if (!key) continue;
      if (triggerOwners[key]) {
        const msg = `trigger collision: "${trigger}" also owned by ${triggerOwners[key]}`;
        if (strict) fail(record.name, msg);
        else warn(record.name, msg);
      } else {
        triggerOwners[key] = record.name;
      }
    }
  }

  // Report
  console.log('='.repeat(60));
  if (warnings.length > 0) {
    console.log(`\n${warnings.length} WARNING(S):`);
    for (const w of warnings) console.log(w);
  }
  if (failures.length > 0) {
    console.log(`\n${failures.length} FAILURE(S):`);
    for (const f of failures) console.log(f);
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Summary: ${records.length}/${skillNames.length} skills validated, ${warnCount} warnings, ${failCount} failures`);

  if (failCount > 0) {
    console.error('\n[FAIL] One or more skills failed validation.');
    process.exit(1);
  }

  if (strict && warnCount > 0) {
    console.error('\n[FAIL] --strict mode: warnings treated as failures.');
    process.exit(1);
  }

  console.log('\n[OK] All skills passed.');
  process.exit(0);
}

main();
