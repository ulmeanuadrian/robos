#!/usr/bin/env node
// scripts/remove-skill.js — Cross-platform skill uninstaller.
//
// Sterge un skill instalat din skills/{name}/. Replaces remove-skill.sh.
// Cere confirmare interactiva (--yes pentru a sari peste).

import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';

const __filename = fileURLToPath(import.meta.url);
const ROBOS_ROOT = join(dirname(__filename), '..');
const SKILLS_DIR = join(ROBOS_ROOT, 'skills');

function listInstalled() {
  if (!existsSync(SKILLS_DIR)) return [];
  return readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name !== '_catalog' && !e.name.startsWith('.'))
    .map(e => e.name)
    .sort();
}

function usage() {
  console.error('Folosire: node scripts/remove-skill.js <skill-name> [--yes]');
  console.error('');
  console.error('Sterge un skill instalat.');
  console.error('');
  console.error('Skills instalate:');
  const installed = listInstalled();
  if (installed.length === 0) console.error('  (niciuna)');
  else for (const s of installed) console.error('  ' + s);
  process.exit(1);
}

async function confirm(question) {
  return new Promise(resolve => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) usage();

  const SKILL_NAME = args[0];
  const skipConfirm = args.includes('--yes') || args.includes('-y');
  const SKILL_DIR = join(SKILLS_DIR, SKILL_NAME);

  if (SKILL_NAME === '_catalog') {
    console.error('EROARE: Nu poti sterge catalogul.');
    process.exit(1);
  }

  if (!existsSync(SKILL_DIR)) {
    console.error(`EROARE: Skill-ul '${SKILL_NAME}' nu e instalat.`);
    process.exit(1);
  }

  if (!skipConfirm) {
    const ok = await confirm(`Stergem skill-ul '${SKILL_NAME}'? (y/N) `);
    if (!ok) {
      console.log('Anulat.');
      process.exit(0);
    }
  }

  rmSync(SKILL_DIR, { recursive: true, force: true });
  console.log(`[OK] Sters: ${SKILL_NAME}`);

  // Regenerate index
  const rebuildResult = spawnSync(process.execPath, [join(ROBOS_ROOT, 'scripts', 'rebuild-index.js')], {
    cwd: ROBOS_ROOT,
    stdio: 'inherit',
  });

  // S25 fix (2026-05-12 codex audit BLOCKER): rebuild esuat dupa rmSync ar
  // lasa _index.json sa liste-uiasca un skill care nu mai exista pe disk
  // (invariant "Skill registry sync" rupt). Folder-ul e deja sters — nu mai
  // putem face rollback simetric ca la add-skill; in schimb ne asiguram ca
  // exit-ul e non-zero ca scripturile parinti sa detecteze esecul si ca
  // operatorul ramane cu un index stale dar cu un semnal clar de "trebuie
  // re-rulat manual".
  if (rebuildResult.status !== 0) {
    console.error('EROARE: rebuild-index.js a esuat dupa stergere.');
    console.error(`Indexul (skills/_index.json) inca listeaza ${SKILL_NAME}.`);
    console.error('Re-ruleaza: node scripts/rebuild-index.js');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('EROARE:', err.message);
  process.exit(1);
});
