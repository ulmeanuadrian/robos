import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { workspaceRoot } from '../lib/config.js';

/**
 * Citeste skills/_index.json (generat de scripts/rebuild-index.js).
 * Returneaza null daca nu exista — caller-ul decide fallback.
 */
function readIndex() {
  const indexPath = join(workspaceRoot, 'skills', '_index.json');
  if (!existsSync(indexPath)) return null;
  try {
    return JSON.parse(readFileSync(indexPath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Parser minimal de YAML frontmatter (fallback cand _index.json lipseste).
 */
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

function readSkillFromDisk(dir, name, installed) {
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
 * GET /api/skills — listeaza skills instalate.
 * Citeste din _index.json daca exista; altfel scaneaza filesystem.
 */
export function listSkills() {
  const index = readIndex();
  if (index && Array.isArray(index.skills)) {
    return index.skills.map(s => ({ ...s, installed: true }));
  }

  const skillsDir = join(workspaceRoot, 'skills');
  if (!existsSync(skillsDir)) return [];

  const entries = readdirSync(skillsDir, { withFileTypes: true });
  return entries
    .filter(e => e.isDirectory() && !e.name.startsWith('_'))
    .filter(e => existsSync(join(skillsDir, e.name, 'SKILL.md')))
    .map(e => readSkillFromDisk(join(skillsDir, e.name), e.name, true));
}

/**
 * GET /api/skills/catalog — listeaza skills disponibile (din catalog.json),
 * marcheaza cele instalate cu installed: true.
 */
export function listCatalog() {
  const catalogPath = join(workspaceRoot, 'skills', '_catalog', 'catalog.json');
  if (!existsSync(catalogPath)) return [];

  let catalog;
  try {
    catalog = JSON.parse(readFileSync(catalogPath, 'utf-8'));
  } catch {
    return [];
  }

  const installedNames = new Set(listSkills().map(s => s.name));

  return (catalog.skills || []).map(s => ({
    ...s,
    installed: installedNames.has(s.name),
  }));
}
