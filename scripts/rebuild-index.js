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

import { readdirSync, readFileSync, writeFileSync, existsSync, statSync, renameSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseFrontmatter, normalizeSkillRecord } from './lib/skill-frontmatter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROBOS_ROOT = join(__dirname, '..');
const SKILLS_DIR = join(ROBOS_ROOT, 'skills');
const INDEX_FILE = join(SKILLS_DIR, '_index.json');
const REQUIRED_SECRETS_FILE = join(ROBOS_ROOT, 'data', 'required-secrets.json');

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

  const entries = readdirSync(SKILLS_DIR, { withFileTypes: true });
  const skills = [];
  const triggerMap = {};

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
      } else {
        triggerMap[key] = skill.name;
      }
    }
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

  // Atomic write: write to .tmp, rename over original.
  // Earlier writeFileSync truncated and rewrote in place. Between truncate
  // and full write, a parallel reader (e.g., hook-user-prompt loadIndex)
  // could read partial content, hit JSON.parse, and silently fall back to
  // an empty cached index — disabling skill routing for that prompt with
  // no surfacing.
  const tmp = INDEX_FILE + '.tmp';
  try {
    writeFileSync(tmp, JSON.stringify(index, null, 2) + '\n', 'utf-8');
    renameSync(tmp, INDEX_FILE);
  } catch (e) {
    try { unlinkSync(tmp); } catch {}
    throw e;
  }
  console.log(`[OK] skills/_index.json regenerat: ${skills.length} skills, ${Object.keys(triggerMap).length} triggers`);

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

  // Atomic write
  const tmp = REQUIRED_SECRETS_FILE + '.tmp';
  try {
    writeFileSync(tmp, JSON.stringify(payload, null, 2) + '\n', 'utf-8');
    renameSync(tmp, REQUIRED_SECRETS_FILE);
  } catch (e) {
    try { unlinkSync(tmp); } catch {}
    throw e;
  }
  console.log(`[OK] data/required-secrets.json regenerat: ${payload.keys.length} key-uri din skills`);
}

buildIndex();
