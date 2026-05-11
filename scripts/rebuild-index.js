#!/usr/bin/env node
/**
 * rebuild-index.js
 *
 * Construieste skills/_index.json din SKILL.md-urile instalate.
 * Single source of truth pentru registry-ul de skills:
 *  - dashboard-ul citeste de aici
 *  - AGENTS.md NU mai duplica tabela
 *  - script-urile add-skill / remove-skill cheama acest generator dupa modificari
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseFrontmatter, normalizeSkillRecord } from './lib/skill-frontmatter.js';
import { atomicWrite } from './lib/atomic-write.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROBOS_ROOT = join(__dirname, '..');
const SKILLS_DIR = join(ROBOS_ROOT, 'skills');
const CATALOG_DIR = join(SKILLS_DIR, '_catalog');
const CATALOG_FILE = join(CATALOG_DIR, 'catalog.json');
const INDEX_FILE = join(SKILLS_DIR, '_index.json');
const REQUIRED_SECRETS_FILE = join(ROBOS_ROOT, 'data', 'required-secrets.json');

/**
 * Detect catalog entries that have no installation source AND are not marked
 * `status: "planned"`. Such entries break `add-skill <name>` with a confusing
 * "not found in catalog" — the user sees the name but installation fails.
 *
 * Returns array of orphan entry names. Empty if catalog is consistent.
 */
function detectCatalogOrphans() {
  if (!existsSync(CATALOG_FILE)) return [];
  let catalog;
  try {
    catalog = JSON.parse(readFileSync(CATALOG_FILE, 'utf-8'));
  } catch {
    return [];
  }
  const skillsList = Array.isArray(catalog.skills) ? catalog.skills : [];
  const orphans = [];
  for (const entry of skillsList) {
    if (!entry || typeof entry.name !== 'string') continue;
    if (entry.status === 'planned') continue;
    const sourceDir = join(CATALOG_DIR, entry.name);
    const installedDir = join(SKILLS_DIR, entry.name);
    const hasSource = existsSync(join(sourceDir, 'SKILL.md'));
    const isInstalled = existsSync(join(installedDir, 'SKILL.md'));
    if (!hasSource && !isInstalled) {
      orphans.push(entry.name);
    }
  }
  return orphans;
}

function readSkill(skillDir, name) {
  const skillMd = join(skillDir, 'SKILL.md');
  if (!existsSync(skillMd)) return null;

  const content = readFileSync(skillMd, 'utf-8');
  const fm = parseFrontmatter(content);
  const stat = statSync(skillMd);

  return {
    ...normalizeSkillRecord(fm, name),
    last_modified: stat.mtime.toISOString(),
  };
}

function buildIndex() {
  if (!existsSync(SKILLS_DIR)) {
    console.error(`ERROR: skills/ nu exista la ${SKILLS_DIR}`);
    process.exit(1);
  }

  const strict = process.argv.includes('--strict');
  const entries = readdirSync(SKILLS_DIR, { withFileTypes: true });
  const skills = [];
  const triggerMap = {};
  const collisions = []; // pentru --strict mode: lista de colizii detectate

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('_')) continue;

    const skill = readSkill(join(SKILLS_DIR, entry.name), entry.name);
    if (!skill) continue;

    skills.push(skill);

    for (const trigger of skill.triggers) {
      const key = trigger.toLowerCase();
      if (triggerMap[key]) {
        console.warn(`WARN: trigger "${trigger}" este folosit de ${triggerMap[key]} si ${skill.name}`);
        collisions.push({ trigger, owners: [triggerMap[key], skill.name] });
      } else {
        triggerMap[key] = skill.name;
      }
    }
  }

  if (strict && collisions.length > 0) {
    console.error(`\n[FAIL] --strict mode: ${collisions.length} trigger collision(s) detected.`);
    console.error(`Fix: deduplicate triggers across SKILL.md files, then re-run.`);
    process.exit(1);
  }

  skills.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.name.localeCompare(b.name);
  });

  const index = {
    generated_at: new Date().toISOString(),
    count: skills.length,
    by_category: skills.reduce((acc, s) => {
      acc[s.category] = (acc[s.category] || 0) + 1;
      return acc;
    }, {}),
    triggers: triggerMap,
    skills,
  };

  // Atomic write via shared lib (handles Windows EBUSY/EPERM retry +
  // tmp cleanup + random hex suffix to avoid concurrent-rotation races).
  atomicWrite(INDEX_FILE, JSON.stringify(index, null, 2) + '\n');
  console.log(`[OK] skills/_index.json regenerat: ${skills.length} skills, ${Object.keys(triggerMap).length} triggers`);

  // Surface catalog orphans (DOC-3): catalog entries with no source AND not
  // installed AND not status:"planned". Print WARN, don't fail rebuild.
  const orphans = detectCatalogOrphans();
  if (orphans.length > 0) {
    console.warn(`[WARN] ${orphans.length} catalog entr(ies) cu sursa lipsa si nu sunt nici planned:`);
    for (const name of orphans) {
      console.warn(`  - ${name} → bash scripts/add-skill.sh ${name} ar fail-ui cu "not found"`);
    }
    console.warn(`  Fix: marca entry-ul "status": "planned" in catalog.json sau adauga sursa la skills/_catalog/${orphans[0]}/`);
  }

  // Aggregate secrets declared by skill frontmatter into data/required-secrets.json.
  // Consumed by:
  //   - scripts/setup-env.js → adds missing slots to .env when skills declare new keys
  //   - centre/api/settings.js → "required_by: [skills]" badges in dashboard UI
  buildRequiredSecrets(skills);
}

function buildRequiredSecrets(skills) {
  const byKey = {}; // key → { required_by: [], optional_for: [] }

  for (const skill of skills) {
    for (const k of (skill.secrets_required || [])) {
      if (!byKey[k]) byKey[k] = { required_by: [], optional_for: [] };
      if (!byKey[k].required_by.includes(skill.name)) {
        byKey[k].required_by.push(skill.name);
      }
    }
    for (const k of (skill.secrets_optional || [])) {
      if (!byKey[k]) byKey[k] = { required_by: [], optional_for: [] };
      if (!byKey[k].optional_for.includes(skill.name)) {
        byKey[k].optional_for.push(skill.name);
      }
    }
  }

  // Sort skill names for stable diffs
  for (const meta of Object.values(byKey)) {
    meta.required_by.sort();
    meta.optional_for.sort();
  }

  const payload = {
    generated_at: new Date().toISOString(),
    keys: Object.keys(byKey).sort(),
    by_key: byKey,
  };

  // Atomic write via shared lib.
  atomicWrite(REQUIRED_SECRETS_FILE, JSON.stringify(payload, null, 2) + '\n');
  console.log(`[OK] data/required-secrets.json regenerat: ${payload.keys.length} key-uri din skills`);
}

buildIndex();
