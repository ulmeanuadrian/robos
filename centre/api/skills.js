import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { workspaceRoot } from '../lib/config.js';

/**
 * Parse simple YAML-like frontmatter from SKILL.md
 */
function parseFrontmatter(content) {
  const normalized = content.replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const fm = {};
  const lines = match[1].split('\n');
  let currentKey = null;
  let currentArray = null;

  for (const line of lines) {
    const kvMatch = line.match(/^(\w[\w_]*)\s*:\s*(.+)/);
    const arrayItemMatch = line.match(/^\s+-\s+"?(.+?)"?\s*$/);

    if (kvMatch) {
      currentKey = kvMatch[1];
      const value = kvMatch[2].trim();
      if (value === '') {
        // Could be start of an array
        currentArray = [];
        fm[currentKey] = currentArray;
      } else {
        fm[currentKey] = value;
        currentArray = null;
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

/**
 * Read a skill directory and return its metadata.
 */
function readSkill(dir, name, installed) {
  const skillMd = join(dir, 'SKILL.md');
  if (!existsSync(skillMd)) {
    return {
      name,
      version: '',
      category: 'unknown',
      description: '',
      triggers: [],
      installed,
    };
  }

  const content = readFileSync(skillMd, 'utf-8');
  const fm = parseFrontmatter(content);

  return {
    name: fm.name || name,
    version: fm.version || '',
    category: fm.category || 'unknown',
    description: fm.description || '',
    triggers: Array.isArray(fm.triggers) ? fm.triggers : [],
    installed,
  };
}

/**
 * GET /api/skills — list installed skills
 */
export function listSkills() {
  const skillsDir = join(workspaceRoot, 'skills');
  if (!existsSync(skillsDir)) return [];

  const entries = readdirSync(skillsDir, { withFileTypes: true });
  return entries
    .filter(e => e.isDirectory() && !e.name.startsWith('_'))
    .filter(e => existsSync(join(skillsDir, e.name, 'SKILL.md')))
    .map(e => readSkill(join(skillsDir, e.name), e.name, true));
}

/**
 * GET /api/skills/catalog — list catalog skills (not installed)
 */
export function listCatalog() {
  const catalogDir = join(workspaceRoot, 'skills', '_catalog');
  if (!existsSync(catalogDir)) return [];

  const installedNames = new Set(listSkills().map(s => s.name));

  const entries = readdirSync(catalogDir, { withFileTypes: true });
  return entries
    .filter(e => e.isDirectory())
    .filter(e => existsSync(join(catalogDir, e.name, 'SKILL.md')))
    .map(e => readSkill(join(catalogDir, e.name), e.name, false))
    .filter(s => !installedNames.has(s.name));
}
