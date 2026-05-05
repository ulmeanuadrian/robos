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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROBOS_ROOT = join(__dirname, '..');
const SKILLS_DIR = join(ROBOS_ROOT, 'skills');
const INDEX_FILE = join(SKILLS_DIR, '_index.json');

function parseFrontmatter(content) {
  const normalized = content.replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const fm = {};
  const lines = match[1].split('\n');
  let currentKey = null;

  for (const line of lines) {
    const kvMatch = line.match(/^(\w[\w_]*)\s*:\s*(.*)$/);
    const arrayItemMatch = line.match(/^\s+-\s+"?(.+?)"?\s*$/);

    if (kvMatch) {
      currentKey = kvMatch[1];
      const value = kvMatch[2].trim().replace(/^["']|["']$/g, '');
      if (value === '') {
        fm[currentKey] = [];
      } else {
        fm[currentKey] = value;
      }
    } else if (arrayItemMatch && currentKey) {
      if (!Array.isArray(fm[currentKey])) {
        fm[currentKey] = [];
      }
      fm[currentKey].push(arrayItemMatch[1]);
    }
  }

  return fm;
}

function readSkill(skillDir, name) {
  const skillMd = join(skillDir, 'SKILL.md');
  if (!existsSync(skillMd)) return null;

  const content = readFileSync(skillMd, 'utf-8');
  const fm = parseFrontmatter(content);
  const stat = statSync(skillMd);

  return {
    name: fm.name || name,
    version: fm.version || '0.0.0',
    category: fm.category || 'unknown',
    description: fm.description || '',
    triggers: Array.isArray(fm.triggers) ? fm.triggers : [],
    negative_triggers: Array.isArray(fm.negative_triggers) ? fm.negative_triggers : [],
    context_loads: Array.isArray(fm.context_loads) ? fm.context_loads : [],
    inputs: Array.isArray(fm.inputs) ? fm.inputs : [],
    outputs: Array.isArray(fm.outputs) ? fm.outputs : [],
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
}

buildIndex();
