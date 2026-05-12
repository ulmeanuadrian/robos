#!/usr/bin/env node
// scripts/add-skill.js — Cross-platform skill installer.
//
// Instaleaza un skill din skills/_catalog/{name}/ in skills/{name}/.
// Replaces add-skill.sh. Same logic, runs on Windows + Mac.

import { existsSync, readdirSync, readFileSync, cpSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const ROBOS_ROOT = join(dirname(__filename), '..');
const CATALOG = join(ROBOS_ROOT, 'skills', '_catalog');
const SKILLS_DIR = join(ROBOS_ROOT, 'skills');

function readDescription(skillMdPath) {
  if (!existsSync(skillMdPath)) return '';
  try {
    const m = readFileSync(skillMdPath, 'utf-8').match(/^description:\s*(.+)$/m);
    if (!m) return '';
    return m[1].trim().replace(/^["']|["']$/g, '');
  } catch { return ''; }
}

function listAvailable() {
  if (!existsSync(CATALOG)) return [];
  return readdirSync(CATALOG, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name !== 'starter-packs' && !e.name.startsWith('.'))
    .map(e => {
      const desc = readDescription(join(CATALOG, e.name, 'SKILL.md'));
      const installed = existsSync(join(SKILLS_DIR, e.name));
      return { name: e.name, desc, installed };
    });
}

function getCatalogStatus(skillName) {
  const catalogJson = join(CATALOG, 'catalog.json');
  if (!existsSync(catalogJson)) return 'unknown';
  try {
    const cat = JSON.parse(readFileSync(catalogJson, 'utf-8'));
    const s = (cat.skills || []).find(x => x.name === skillName);
    if (!s) return 'unknown';
    return s.status || 'available-but-no-source';
  } catch { return 'unknown'; }
}

function usage() {
  console.error('Folosire: node scripts/add-skill.js <skill-name>');
  console.error('');
  console.error('Instaleaza un skill din catalog in skills/.');
  console.error('');
  console.error('Skills disponibile:');
  const skills = listAvailable();
  if (skills.length === 0) {
    console.error('  (catalogul e gol)');
  } else {
    for (const s of skills) {
      const tag = s.installed ? ' [instalat]' : '';
      const desc = s.desc ? ' -- ' + s.desc : '';
      console.error(`  ${s.name}${desc}${tag}`);
    }
  }
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length < 1) usage();

const SKILL_NAME = args[0];
const SKILL_SRC = join(CATALOG, SKILL_NAME);
const SKILL_DST = join(SKILLS_DIR, SKILL_NAME);

if (!existsSync(SKILL_SRC)) {
  const status = getCatalogStatus(SKILL_NAME);
  if (status === 'planned') {
    console.error(`Skill-ul '${SKILL_NAME}' e PLANIFICAT dar nu are source pe disk inca.`);
    console.error('Vezi catalog.json — feature pe roadmap, nu instalabil acum.');
    process.exit(1);
  }
  console.error(`EROARE: Skill-ul '${SKILL_NAME}' nu exista in catalog.`);
  console.error('Ruleaza: node scripts/list-skills.js ca sa vezi ce e disponibil.');
  process.exit(1);
}

if (!existsSync(join(SKILL_SRC, 'SKILL.md'))) {
  console.error(`EROARE: ${SKILL_SRC}/SKILL.md lipseste. Catalogul e corupt.`);
  process.exit(1);
}

if (existsSync(SKILL_DST)) {
  console.log(`Skill-ul '${SKILL_NAME}' e deja instalat.`);
  console.log(`Pentru reinstalare: node scripts/remove-skill.js ${SKILL_NAME}`);
  process.exit(0);
}

// Copy skill recursively
cpSync(SKILL_SRC, SKILL_DST, { recursive: true });
console.log(`[OK] Copiat pe disk: ${SKILL_NAME}`);

// Regenerate index
const rebuildResult = spawnSync(process.execPath, [join(ROBOS_ROOT, 'scripts', 'rebuild-index.js')], {
  cwd: ROBOS_ROOT,
  stdio: 'inherit',
});

// S25 fix (2026-05-12 codex audit BLOCKER): if rebuild esueaza dupa cpSync,
// rollback folderul. Altfel ramane drift intre skills/ pe disk si _index.json
// (invariant "Skill registry sync" rupt — dashboard si router vad realitati
// diferite). Folder-ul tocmai a fost copiat din catalog; nimic user-edited
// inca, rollback-ul e safe.
if (rebuildResult.status !== 0) {
  console.error('EROARE: rebuild-index.js a esuat. Rollback: scot folderul instalat.');
  try {
    rmSync(SKILL_DST, { recursive: true, force: true });
    console.error(`[ROLLBACK] Scos: ${SKILL_DST}`);
  } catch (e) {
    console.error(`[ATENTIE] Rollback partial — sterge manual ${SKILL_DST}: ${e.message}`);
  }
  process.exit(1);
}

console.log('');
console.log(`Skill-ul '${SKILL_NAME}' e gata. Rulezi cu trigger-ul natural sau '${SKILL_NAME}' direct.`);
