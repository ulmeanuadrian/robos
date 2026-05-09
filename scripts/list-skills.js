#!/usr/bin/env node
// scripts/list-skills.js — Cross-platform skill inventory.
//
// Listeaza skills instalate in skills/ + skills disponibile (din catalog dar
// neinstalate). Replaces list-skills.sh. Runs on Windows + Mac.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROBOS_ROOT = join(dirname(__filename), '..');
const CATALOG = join(ROBOS_ROOT, 'skills', '_catalog');
const SKILLS_DIR = join(ROBOS_ROOT, 'skills');

function parseFrontmatterField(skillMdPath, field) {
  if (!existsSync(skillMdPath)) return '';
  try {
    const re = new RegExp(`^${field}:\\s*(.+)$`, 'm');
    const m = readFileSync(skillMdPath, 'utf-8').match(re);
    if (!m) return '';
    return m[1].trim().replace(/^["']|["']$/g, '');
  } catch { return ''; }
}

function format(name, version, desc) {
  let line = `  ${name}`;
  if (version) line += ` v${version}`;
  if (desc) line += ` -- ${desc}`;
  return line;
}

console.log('=== robOS Skills ===');
console.log('');

// Installed skills (skills/{name}/, excluding _catalog)
console.log('INSTALATE:');
let installedCount = 0;
const installedSet = new Set();
if (existsSync(SKILLS_DIR)) {
  const entries = readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name !== '_catalog' && !e.name.startsWith('.'))
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const skillMd = join(SKILLS_DIR, entry.name, 'SKILL.md');
    const version = parseFrontmatterField(skillMd, 'version');
    const desc = parseFrontmatterField(skillMd, 'description');
    console.log(format(entry.name, version, desc));
    installedSet.add(entry.name);
    installedCount++;
  }
}

if (installedCount === 0) console.log('  (niciuna)');

console.log('');

// Available (in catalog but not installed)
console.log('DISPONIBILE (neinstalate):');
let availableCount = 0;
if (existsSync(CATALOG)) {
  const entries = readdirSync(CATALOG, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name !== 'starter-packs' && !e.name.startsWith('.'))
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    if (installedSet.has(entry.name)) continue;
    const skillMd = join(CATALOG, entry.name, 'SKILL.md');
    const version = parseFrontmatterField(skillMd, 'version');
    const desc = parseFrontmatterField(skillMd, 'description');
    console.log(format(entry.name, version, desc));
    availableCount++;
  }
}

if (availableCount === 0) console.log('  (niciuna)');

console.log('');
console.log('Instalare: node scripts/add-skill.js <nume>');
console.log('Stergere:  node scripts/remove-skill.js <nume>');
