#!/usr/bin/env node
/**
 * skill-route.js
 *
 * Hard router pentru skills. Citeste un prompt (string sau stdin), compara cu
 * triggers din skills/_index.json, returneaza skill-ul matchat (daca e unul).
 *
 * Folosit de:
 *  - hook-ul UserPromptSubmit (injecteaza "use skill X" cand match exista)
 *  - debugging manual din CLI: `node scripts/skill-route.js "scrie un articol despre AI"`
 *
 * Politica de matching:
 *  1. Triggers SUNT case-insensitive si normalizate (diacritice eliminate)
 *  2. Verifica negative_triggers pe skill INAINTE de pozitive — daca un negativ matches, sari peste skill
 *  3. Match longest-trigger-wins cand sunt mai multe candidati (ex: "creeaza un skill" bate "skill")
 *  4. Returneaza JSON cu skill-ul, trigger-ul, si toate matchurile (pentru debug)
 *
 * Output:
 *  {
 *    "matched": true|false,
 *    "skill": "content-blog-post",
 *    "trigger": "scrie un articol",
 *    "candidates": [{skill, trigger, score}],
 *    "reason": "longest_trigger_match"
 *  }
 */

import { readFileSync, existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROBOS_ROOT = join(__dirname, '..');
const INDEX_FILE = join(ROBOS_ROOT, 'skills', '_index.json');

function normalize(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritical marks
    .replace(/\s+/g, ' ')
    .trim();
}

// Cache pe proces — _index.json se schimba doar cand rebuild-index.js ruleaza.
// Verifica mtime la fiecare apel; reload doar daca s-a schimbat.
// NOTA: hook-ul UserPromptSubmit spawn-uieste un proces nou per prompt, deci cache-ul
// nu persista intre prompts. Beneficiul real e doar pentru consumerii in-process
// (ex: server-ul centre care apeleaza routePrompt din runSkill sau alte API endpoints).
let cachedIndex = null;
let cachedMtimeMs = 0;

function loadIndex() {
  if (!existsSync(INDEX_FILE)) {
    return { skills: [], triggers: {} };
  }

  let mtime;
  try {
    mtime = statSync(INDEX_FILE).mtimeMs;
  } catch {
    return cachedIndex || { skills: [], triggers: {} };
  }

  if (cachedIndex && mtime === cachedMtimeMs) {
    return cachedIndex;
  }

  try {
    cachedIndex = JSON.parse(readFileSync(INDEX_FILE, 'utf-8'));
    cachedMtimeMs = mtime;
    return cachedIndex;
  } catch {
    return cachedIndex || { skills: [], triggers: {} };
  }
}

/**
 * @param {string} prompt
 * @returns {{matched: boolean, skill?: string, trigger?: string, candidates: Array, reason: string}}
 */
export function routePrompt(prompt) {
  const index = loadIndex();
  const normPrompt = normalize(prompt);
  if (!normPrompt) {
    return { matched: false, candidates: [], reason: 'empty_prompt' };
  }

  const candidates = [];

  for (const skill of index.skills || []) {
    // Negative triggers first — daca un negativ matches, skill-ul e exclus
    const negs = skill.negative_triggers || [];
    let excluded = false;
    for (const neg of negs) {
      if (normPrompt.includes(normalize(neg))) {
        excluded = true;
        break;
      }
    }
    if (excluded) continue;

    // Pozitive triggers
    const trigs = skill.triggers || [];
    for (const trig of trigs) {
      const normTrig = normalize(trig);
      if (!normTrig) continue;
      if (normPrompt.includes(normTrig)) {
        candidates.push({
          skill: skill.name,
          trigger: trig,
          score: normTrig.length, // longest wins
        });
      }
    }
  }

  if (candidates.length === 0) {
    return { matched: false, candidates: [], reason: 'no_trigger_match' };
  }

  candidates.sort((a, b) => b.score - a.score);
  const winner = candidates[0];

  return {
    matched: true,
    skill: winner.skill,
    trigger: winner.trigger,
    candidates,
    reason: 'longest_trigger_match',
  };
}

// CLI mode (cand fisierul e executat direct, nu importat ca modul)
const argv1 = process.argv[1] || '';
const isMain = argv1 && (
  import.meta.url === `file://${argv1}` ||
  import.meta.url.endsWith(argv1.replace(/\\/g, '/'))
);

if (isMain) {
  let prompt = '';

  if (process.argv.length > 2) {
    prompt = process.argv.slice(2).join(' ');
  } else {
    // Read from stdin
    prompt = readFileSync(0, 'utf-8');
  }

  const result = routePrompt(prompt);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.matched ? 0 : 1);
}
