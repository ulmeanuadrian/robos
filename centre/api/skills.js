import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { workspaceRoot } from '../lib/config.js';
import { parseFrontmatter, normalizeSkillRecord } from '../../scripts/lib/skill-frontmatter.js';

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

function readSkillFromDisk(dir, name, installed) {
  const skillMd = join(dir, 'SKILL.md');
  if (!existsSync(skillMd)) {
    return { ...normalizeSkillRecord({}, name), installed };
  }
  const content = readFileSync(skillMd, 'utf-8');
  const fm = parseFrontmatter(content);
  return { ...normalizeSkillRecord(fm, name), installed };
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
