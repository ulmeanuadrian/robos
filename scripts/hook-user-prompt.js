#!/usr/bin/env node
/**
 * hook-user-prompt.js
 *
 * Hook handler pentru evenimentul UserPromptSubmit din Claude Code.
 *
 * Responsabilitati (in ordine):
 *  1. Detecteaza daca acesta e PRIMUL prompt al sesiunii (via marker file in data/session-state/).
 *  2. Daca e primul: construieste un bundle de startup (memoria zilei + open threads + recovery flags)
 *     si il injecteaza ca additionalContext. Imposibil de ignorat — vine ca system reminder.
 *  3. Indiferent daca e primul sau nu: ruleaza skill-route pe prompt si, daca matches, injecteaza
 *     o instructiune "use skill X" tot in additionalContext.
 *
 * Output JSON pe stdout (format hook standard):
 *  {
 *    "hookSpecificOutput": {
 *      "hookEventName": "UserPromptSubmit",
 *      "additionalContext": "..."
 *    }
 *  }
 *
 * Daca nu e nimic de injectat (nu e first-of-session si niciun skill match), nu output.
 *
 * Niciodata nu blocheaza promptul. Niciodata nu printeaza pe stderr decat la erori reale.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { routePrompt } from './skill-route.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROBOS_ROOT = join(__dirname, '..');
const SESSION_STATE_DIR = join(ROBOS_ROOT, 'data', 'session-state');
const MEMORY_DIR = join(ROBOS_ROOT, 'context', 'memory');

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/**
 * Verifica daca acesta e primul prompt din sesiunea curenta.
 * Marcheaza sesiunea ca "vazuta" prin scrierea unui marker file.
 *
 * @param {string} sessionId
 * @returns {boolean} true daca e primul prompt al sesiunii
 */
function isFirstOfSession(sessionId) {
  ensureDir(SESSION_STATE_DIR);
  const marker = join(SESSION_STATE_DIR, `${sessionId}.json`);
  if (existsSync(marker)) return false;
  writeFileSync(marker, JSON.stringify({
    session_id: sessionId,
    started_at: new Date().toISOString(),
    first_prompt_at: new Date().toISOString(),
  }, null, 2));
  return true;
}

/**
 * Gaseste cel mai recent fisier de memorie (dupa filename, nu mtime).
 * Returneaza { date, path, content, hasClosingPattern } sau null.
 */
function findLatestMemoryFile() {
  if (!existsSync(MEMORY_DIR)) return null;

  const files = readdirSync(MEMORY_DIR)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .sort()
    .reverse();

  if (files.length === 0) return null;

  const latest = files[0];
  const path = join(MEMORY_DIR, latest);
  const content = readFileSync(path, 'utf-8');
  const date = latest.replace(/\.md$/, '');
  const hasClosingPattern = /Session:\s*\d+\s*deliverables/i.test(content);

  return { date, path, content, hasClosingPattern };
}

/**
 * Citeste memoria zilei curente. Returneaza content sau null.
 */
function readTodayMemory() {
  const path = join(MEMORY_DIR, `${todayISO()}.md`);
  if (!existsSync(path)) return null;
  return { path, content: readFileSync(path, 'utf-8') };
}

/**
 * Extrage Open Threads din continut markdown.
 * Returneaza array de stringuri (bullet items) sau [].
 */
function extractOpenThreads(content) {
  if (!content) return [];

  // Cauta ultima sectiune ### Open Threads
  const matches = [...content.matchAll(/###\s+Open\s+Threads\s*\n([\s\S]*?)(?=\n###|\n##|$)/gi)];
  if (matches.length === 0) return [];

  const lastSection = matches[matches.length - 1][1];
  return lastSection
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('-') || l.startsWith('*'))
    .map(l => l.replace(/^[-*]\s+/, ''));
}

/**
 * Citeste si consuma data/session-recovery.json daca exista (creat de session-timeout-detector).
 * Returneaza payload-ul sau null. Sterge fisierul dupa citire (one-shot).
 */
function consumeRecoveryFile() {
  const recoveryPath = join(ROBOS_ROOT, 'data', 'session-recovery.json');
  if (!existsSync(recoveryPath)) return null;
  try {
    const data = JSON.parse(readFileSync(recoveryPath, 'utf-8'));
    if (data.consumed) return null;
    // Marcheaza consumed (in loc sa stergem, pastram istoric)
    data.consumed = true;
    data.consumed_at = new Date().toISOString();
    writeFileSync(recoveryPath, JSON.stringify(data, null, 2));
    return data;
  } catch {
    return null;
  }
}

/**
 * Construieste bundle-ul de startup pentru primul prompt al sesiunii.
 */
function buildStartupBundle() {
  const today = todayISO();
  const todayMem = readTodayMemory();
  const latest = findLatestMemoryFile();
  const recovery = consumeRecoveryFile();

  const lines = [];
  lines.push(`[STARTUP CONTEXT — primul prompt al sesiunii ${today}]`);
  lines.push('');

  // Recovery: daca session-timeout-detector a marcat sesiuni abandonate, surface-uim
  if (recovery && recovery.abandoned_sessions?.length > 0) {
    lines.push('!! RECOVERY: session-timeout-detector a marcat sesiune(i) abandonata(e):');
    for (const s of recovery.abandoned_sessions.slice(0, 3)) {
      lines.push(`  - ${s.sessionId} (memorie ${s.memDate || 'none'}, ${s.ageMin} min de inactivitate)`);
    }
    lines.push('Mentioneaza-i userului ca ultima sesiune nu s-a inchis curat si intreaba daca reia sau face cleanup.');
    lines.push('');
  }

  // Caz 1: avem memorie pentru azi
  if (todayMem) {
    const threads = extractOpenThreads(todayMem.content);
    lines.push(`Memoria zilei (${today}) deja exista la ${todayMem.path}.`);
    if (threads.length > 0) {
      lines.push(`Open threads din azi (${threads.length}):`);
      for (const t of threads.slice(0, 8)) {
        lines.push(`  - ${t}`);
      }
    } else {
      lines.push('Niciun open thread inregistrat azi.');
    }
  } else if (latest) {
    // Caz 2: nu avem memorie pentru azi, dar avem o sesiune anterioara
    const daysAgo = Math.floor((Date.now() - new Date(latest.date).getTime()) / 86400000);
    const threads = extractOpenThreads(latest.content);

    if (!latest.hasClosingPattern && threads.length > 0) {
      lines.push(`! Sesiunea anterioara (${latest.date}) NU s-a inchis cu pattern-ul "Session: X deliverables".`);
      lines.push(`Open threads ramase neterminate (${threads.length}):`);
      for (const t of threads.slice(0, 8)) {
        lines.push(`  - ${t}`);
      }
      lines.push('');
      lines.push('Mentioneaza-i userului aceste open threads la prima interactiune si intreaba daca le continuati.');
    } else if (daysAgo > 3) {
      lines.push(`Userul a fost plecat ${daysAgo} zile (ultima sesiune: ${latest.date}).`);
      if (threads.length > 0) {
        lines.push(`Open threads din ultima sesiune (${threads.length}):`);
        for (const t of threads.slice(0, 5)) {
          lines.push(`  - ${t}`);
        }
      }
      lines.push('Ofera un context recap scurt la prima interactiune.');
    } else {
      lines.push(`Ultima sesiune: ${latest.date} (s-a inchis curat).`);
      if (threads.length > 0) {
        lines.push(`Open threads ramase: ${threads.slice(0, 3).join(' | ')}`);
      }
    }
  } else {
    lines.push('Niciun fisier de memorie existent — sesiune complet noua.');
  }

  lines.push('');
  lines.push('Protocol obligatoriu inainte de a raspunde:');
  lines.push('  1. Citeste tacit context/SOUL.md si context/USER.md (daca nu le-ai citit deja).');
  lines.push('  2. Daca primul mesaj al userului e o salutare, raspunde scurt si mentioneaza open threads (daca exista).');
  lines.push('  3. Daca primul mesaj e un task, mergi direct la lucru — fara preambul.');
  lines.push('[/STARTUP CONTEXT]');

  return lines.join('\n');
}

/**
 * Construieste sectiunea de routare skill (apare la fiecare prompt, nu doar primul).
 */
function buildSkillRouteHint(prompt) {
  const result = routePrompt(prompt);
  if (!result.matched) return null;

  return [
    `[SKILL ROUTER]`,
    `Promptul a matchat trigger-ul "${result.trigger}" pentru skill-ul "${result.skill}".`,
    `Foloseste skill-ul ${result.skill} (citeste skills/${result.skill}/SKILL.md si urmeaza pasii).`,
    `Daca alegi sa NU folosesti skill-ul, justifica explicit de ce baza ta de cunostinte e mai potrivita.`,
    `[/SKILL ROUTER]`,
  ].join('\n');
}

async function main() {
  let payload = {};
  try {
    const stdin = readFileSync(0, 'utf-8');
    payload = stdin.trim() ? JSON.parse(stdin) : {};
  } catch (e) {
    // Nu putem parsa input-ul → iesim curat fara sa blocam
    process.exit(0);
  }

  const sessionId = payload.session_id || 'unknown';
  const prompt = payload.prompt || '';

  const sections = [];

  // Section 1: Startup bundle (doar la primul prompt)
  if (isFirstOfSession(sessionId)) {
    sections.push(buildStartupBundle());
  }

  // Section 2: Skill route hint (la fiecare prompt unde matches)
  const skillHint = buildSkillRouteHint(prompt);
  if (skillHint) sections.push(skillHint);

  if (sections.length === 0) {
    process.exit(0);
  }

  const output = {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: sections.join('\n\n'),
    },
  };

  process.stdout.write(JSON.stringify(output));
  process.exit(0);
}

main().catch((e) => {
  // Niciodata nu blocheaza promptul din cauza unei erori de hook.
  process.stderr.write(`[hook-user-prompt error] ${e.message}\n`);
  process.exit(0);
});
