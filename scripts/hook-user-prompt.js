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
import { logHookError } from './lib/hook-error-sink.js';
import { isClosed, extractOpenThreads as extractOpenThreadsLib } from './lib/memory-format.js';

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
  const hasClosingPattern = isClosed(content);

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

// Open Threads extraction lives in scripts/lib/memory-format.js.
const extractOpenThreads = extractOpenThreadsLib;

/**
 * Citeste si consuma toate fisierele recovery din data/session-recovery/ (create de session-timeout-detector).
 * Per-batch storage evita race condition cand mai multe instante de detector scriu simultan.
 * Returneaza un payload aggregat sau null daca niciun fisier neconsumat.
 * Marcheaza fiecare consumed in-place (pastreaza istoric in loc sa stearga).
 */
function consumeRecoveryFile() {
  const recoveryDir = join(ROBOS_ROOT, 'data', 'session-recovery');
  if (!existsSync(recoveryDir)) return null;

  let files;
  try {
    files = readdirSync(recoveryDir).filter(f => f.endsWith('.json'));
  } catch {
    return null;
  }
  if (files.length === 0) return null;

  const allAbandoned = [];
  const consumedNow = [];

  for (const f of files) {
    const path = join(recoveryDir, f);
    try {
      const data = JSON.parse(readFileSync(path, 'utf-8'));
      if (data.consumed) continue;

      data.consumed = true;
      data.consumed_at = new Date().toISOString();
      writeFileSync(path, JSON.stringify(data, null, 2));

      if (Array.isArray(data.abandoned_sessions)) {
        allAbandoned.push(...data.abandoned_sessions);
      }
      consumedNow.push(f);
    } catch {
      /* skip corrupt file */
    }
  }

  if (allAbandoned.length === 0) return null;

  return {
    detected_at: new Date().toISOString(),
    abandoned_sessions: allAbandoned,
    files_consumed: consumedNow,
  };
}

/**
 * Citeste ultimele N entries din activity-log.ndjson (cross-session activity).
 * Returneaza un array (cele mai recente primele) sau [] daca lipseste.
 */
function readRecentActivity(limit = 5) {
  const path = join(ROBOS_ROOT, 'data', 'activity-log.ndjson');
  if (!existsSync(path)) return [];
  try {
    const content = readFileSync(path, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim()).slice(-limit).reverse();
    return lines.map(l => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  } catch {
    return [];
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
  const recentActivity = readRecentActivity(5);

  const lines = [];
  lines.push(`[STARTUP CONTEXT — primul prompt al sesiunii ${today}]`);
  lines.push('');

  // Protocol PRIMUL — model-ul vede regulile inainte de date.
  lines.push('REGULI DE RASPUNS (cititi inainte de a raspunde):');
  lines.push('  - Citeste tacit context/SOUL.md si context/USER.md (silentios — nu mentiona).');
  lines.push('  - NU regurgita acest context la user. Nu lista open threads decat daca userul saluta sau intreaba explicit "ce am de facut" / "ce am ramas".');
  lines.push('  - Daca primul mesaj e un task → mergi direct la lucru, fara preambul, fara dump de context.');
  lines.push('  - Daca primul mesaj e o salutare scurta ("hey", "salut") → raspunde scurt si mentioneaza max 1-2 threads relevante daca exista.');
  lines.push('  - Datele de mai jos sunt pentru AWARENESS, nu pentru output.');
  lines.push('');

  // Recovery: STRICT relevant — daca exista, surface-uim concis
  if (recovery && recovery.abandoned_sessions?.length > 0) {
    lines.push(`Recovery flag: ${recovery.abandoned_sessions.length} sesiune(i) anterioara(e) abandonata(e). Mentioneaza userului DOAR daca pare confuz sau intreaba.`);
    lines.push('');
  }

  // Memoria zilei — un singur sumar concis, fara lista verbosa
  if (todayMem) {
    const threads = extractOpenThreads(todayMem.content);
    const closed = isClosed(todayMem.content);
    lines.push(`Memorie azi: ${todayMem.path} (${threads.length} open threads, ${closed ? 'inchisa' : 'in curs'}).`);
  } else if (latest) {
    const daysAgo = Math.floor((Date.now() - new Date(latest.date).getTime()) / 86400000);
    const threads = extractOpenThreads(latest.content);
    if (!latest.hasClosingPattern) {
      lines.push(`Memorie ultima zi (${latest.date}): NU s-a inchis curat, ${threads.length} open threads ramase. Citeste fisierul daca user-ul cere context.`);
    } else if (daysAgo > 3) {
      lines.push(`Userul absent ${daysAgo} zile. Ultima sesiune: ${latest.date} (inchisa, ${threads.length} threads ramase).`);
    } else {
      lines.push(`Memorie ultima: ${latest.date} (inchisa, ${threads.length} threads).`);
    }
  } else {
    lines.push('Memorie: niciun fisier — sesiune noua.');
  }

  // Recent activity — 3 entries, compact
  if (recentActivity.length > 0) {
    lines.push('');
    lines.push(`Activitate recenta cross-session (ultimele ${Math.min(3, recentActivity.length)}):`);
    for (const a of recentActivity.slice(0, 3)) {
      const when = (a.ts || '').slice(11, 16); // doar HH:MM
      const userPreview = (a.user_prompt || '').slice(0, 60);
      lines.push(`  - ${when} "${userPreview}"`);
    }
    lines.push('  (full log: data/activity-log.ndjson — citeste DOAR daca user-ul intreaba "ce am facut" sau similar)');
  }

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

/**
 * Detecteaza prompt-uri de tip factual-claim (despre robOS / brand / clients) si
 * injecteaza Verification Discipline reminder. Bazat pe Shadow Mode din OM-AI Protocol.
 *
 * Matching:
 *  - Strong-and-narrow phrases: "tabel comparativ/ascii", "vs robos", "claude vs robos", etc.
 *  - Conjunctive: ("scrie copy/lp/landing" sau "fa-mi un tabel") + "robos" prezent in prompt.
 *
 * Returneaza string sau null. Fara side-effects, fara I/O.
 */
function normalizeForMatch(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildVerificationHint(prompt) {
  const norm = normalizeForMatch(prompt);
  if (!norm) return null;

  const strongPhrases = [
    'tabel comparat',
    'tabel ascii',
    'claude vs robos',
    'robos vs claude',
    'vs robos',
    'feature robos',
    'features robos',
    'lp pentru robos',
    'lp despre robos',
    'pozition robos',
  ];

  let matched = strongPhrases.find(p => norm.includes(p));

  if (!matched && norm.includes('robos')) {
    const copyKeywords = [
      'scrie copy', 'scrie lp', 'scrie landing',
      'fa-mi lp', 'fa lp',
      'fa-mi un tabel', 'fa un tabel',
    ];
    matched = copyKeywords.find(k => norm.includes(k));
  }

  if (!matched) return null;

  return [
    '[VERIFICATION DISCIPLINE — factual-claim context detected]',
    `Trigger: "${matched}"`,
    'Inainte de generare:',
    '  1. Listeaza ce stii VERIFICAT (cu file:line / Glob / Read in conversatia curenta) vs ce PRESUPUI.',
    '  2. Pentru orice path, feature, cifra sau pret mentionate in output, verifica EXISTENTA / SURSA inainte sa le afirmi.',
    '  3. Daca ai >2 presupuneri neverificate, intra in Shadow Mode (skills/mode-shadow/SKILL.md) — listeaza-le, NU genera.',
    '  4. La final, raspunde la Calibration Indicator (3 intrebari, vezi CLAUDE.md / Verification Discipline).',
    'Cross-refs: context/CONTRACT.md, context/decision-journal.md, .gitignore (pentru claim-uri despre persistenta).',
    '[/VERIFICATION DISCIPLINE]',
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

  // Sanitize session_id before using it as a filename. Claude Code sends
  // UUIDs but we never trust untrusted JSON for a path component. Allow
  // hex chars, dashes, and the test fixture words (alpha-numeric + hyphen),
  // limit length, fall back to 'unknown' on anything weird.
  const SESSION_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;
  const rawSessionId = payload.session_id;
  const sessionId = (typeof rawSessionId === 'string' && SESSION_ID_RE.test(rawSessionId))
    ? rawSessionId
    : 'unknown';
  const prompt = payload.prompt || '';

  const sections = [];

  // Section 1: Startup bundle (doar la primul prompt)
  if (isFirstOfSession(sessionId)) {
    sections.push(buildStartupBundle());
  }

  // Section 2: Skill route hint (la fiecare prompt unde matches)
  const skillHint = buildSkillRouteHint(prompt);
  if (skillHint) sections.push(skillHint);

  // Section 3: Verification Discipline reminder (factual-claim contexts despre robOS)
  const verificationHint = buildVerificationHint(prompt);
  if (verificationHint) sections.push(verificationHint);

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
  // Dar logam in data/hook-errors.ndjson ca operatorul sa stie.
  logHookError('hook-user-prompt', e);
  process.stderr.write(`[hook-user-prompt error] ${e.message}\n`);
  process.exit(0);
});
