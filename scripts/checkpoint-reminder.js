#!/usr/bin/env node
/**
 * checkpoint-reminder.js
 *
 * Hook handler pentru evenimentul Stop (la sfarsitul fiecarui turn al modelului).
 * Verifica daca au trecut >30min de la ultima scriere in memoria zilei.
 * Daca da, injecteaza un reminder ca model-ul sa scrie checkpoint inainte de
 * urmatorul turn.
 *
 * Output:
 *  - Daca checkpoint e necesar: JSON cu hookSpecificOutput.additionalContext
 *  - Altfel: niciun output (exit 0)
 *
 * Niciodata nu blocheaza — daca apar erori, exit 0 silentios.
 *
 * Configurare:
 *  - Threshold poate fi suprascris cu env var ROBOS_CHECKPOINT_MIN (default 30)
 *  - Dezactivare: set ROBOS_CHECKPOINT_DISABLED=1
 */

import { readFileSync, statSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logHookError } from './lib/hook-error-sink.js';
import { getMemoryDir } from './lib/client-context.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROBOS_ROOT = join(__dirname, '..');
const STATE_DIR = join(ROBOS_ROOT, 'data', 'session-state');

const DEFAULT_THRESHOLD_MIN = parseInt(process.env.ROBOS_CHECKPOINT_MIN || '30', 10);

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/**
 * Determina cand a fost ultima oara cand memoria zilei a fost actualizata.
 * Resolves through getMemoryDir() — picks client memory if a client is active.
 * Returneaza un timestamp ms sau null daca fisierul nu exista.
 */
function lastMemoryWriteMs() {
  const path = join(getMemoryDir(), `${todayISO()}.md`);
  if (!existsSync(path)) return null;
  try {
    return statSync(path).mtimeMs;
  } catch {
    return null;
  }
}

/**
 * Citeste starea de checkpoint pentru aceasta sesiune.
 * Stocat in data/session-state/{session_id}-checkpoint.json.
 * Tracks: ultimul reminder + counter pentru escaladare progresiva.
 */
function readCheckpointState(sessionId) {
  const path = join(STATE_DIR, `${sessionId}-checkpoint.json`);
  if (!existsSync(path)) return { last_reminder_ms: 0, unheeded_count: 0, last_memory_write_ms: 0 };
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return { last_reminder_ms: 0, unheeded_count: 0, last_memory_write_ms: 0 };
  }
}

function writeCheckpointState(sessionId, state) {
  ensureDir(STATE_DIR);
  const path = join(STATE_DIR, `${sessionId}-checkpoint.json`);
  writeFileSync(path, JSON.stringify(state, null, 2));
}

async function main() {
  if (process.env.ROBOS_CHECKPOINT_DISABLED === '1') {
    process.exit(0);
  }

  let payload = {};
  try {
    const stdin = readFileSync(0, 'utf-8');
    payload = stdin.trim() ? JSON.parse(stdin) : {};
  } catch {
    process.exit(0);
  }

  // Validate session_id before using as filename. Claude Code sends UUIDs
  // but untrusted JSON is never trusted for a path component.
  const SESSION_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;
  const rawSessionId = payload.session_id;
  const sessionId = (typeof rawSessionId === 'string' && SESSION_ID_RE.test(rawSessionId))
    ? rawSessionId
    : 'unknown';
  const now = Date.now();
  const thresholdMs = DEFAULT_THRESHOLD_MIN * 60 * 1000;

  const lastWrite = lastMemoryWriteMs();
  const state = readCheckpointState(sessionId);

  // Daca memoria a fost scrisa dupa ultimul reminder, RESET counter (model a respectat).
  if (lastWrite && lastWrite > state.last_reminder_ms) {
    if (state.unheeded_count > 0) {
      writeCheckpointState(sessionId, {
        ...state,
        unheeded_count: 0,
        last_memory_write_ms: lastWrite,
      });
    }
  }

  // Caz 1: nu exista memorie pentru azi → reminder daca sesiunea a inceput de >threshold
  if (!lastWrite) {
    const sessionMarker = join(STATE_DIR, `${sessionId}.json`);
    if (existsSync(sessionMarker)) {
      try {
        const data = JSON.parse(readFileSync(sessionMarker, 'utf-8'));
        const startedMs = new Date(data.started_at).getTime();
        if ((now - startedMs) > thresholdMs && (now - state.last_reminder_ms) > thresholdMs) {
          emitReminder(sessionId, now, 'no_memory_file_yet', null, state);
          return;
        }
      } catch { /* noop */ }
    }
    process.exit(0);
  }

  // Caz 2: memorie exista, dar nu a fost atinsa de >threshold
  const sinceWrite = now - lastWrite;
  if (sinceWrite > thresholdMs && (now - state.last_reminder_ms) > thresholdMs) {
    emitReminder(sessionId, now, 'memory_stale', sinceWrite, state);
    return;
  }

  process.exit(0);
}

function emitReminder(sessionId, now, reason, sinceWriteMs, state) {
  const newCount = (state.unheeded_count || 0) + 1;
  writeCheckpointState(sessionId, {
    ...state,
    last_reminder_ms: now,
    unheeded_count: newCount,
  });

  const minSince = sinceWriteMs ? Math.floor(sinceWriteMs / 60000) : null;
  const reasonText = reason === 'no_memory_file_yet'
    ? 'Sesiunea ruleaza de mai mult de pragul de checkpoint si memoria zilei nu a fost creata inca.'
    : `Memoria zilei nu a fost actualizata de ${minSince} minute.`;

  // Build client-aware memory path so escalation messages point to the right place.
  const memoryDir = getMemoryDir();
  const memoryRel = memoryDir
    .slice(ROBOS_ROOT.length + 1)
    .replace(/\\/g, '/');
  const memoryFileRel = `${memoryRel}/${todayISO()}.md`;

  // Escaladare in 3 trepte:
  //  Level 1 (count=1): nudge soft
  //  Level 2 (count=2): URGENT, language stricter
  //  Level 3+ (count>=3): block decision — forteaza model sa continue lucrul
  if (newCount >= 3) {
    // Block decision — Claude Code va impiedica modelul sa termine
    const output = {
      decision: 'block',
      reason: `${reasonText} Asta e al ${newCount}-lea reminder unheeded — am blocat stop-ul ca sa scrii memoria zilei ACUM. Adauga sectiunile Goal/Deliverables/Decisions/Open Threads in ${memoryFileRel}, apoi continua. Acest block se ridica automat dupa ce memoria primeste o scriere.`,
    };
    process.stdout.write(JSON.stringify(output));
    process.exit(0);
  }

  const urgency = newCount === 1 ? 'CHECKPOINT REMINDER' : 'CHECKPOINT URGENT (al 2-lea reminder)';
  const lines = [
    `[${urgency}]`,
    reasonText,
    '',
    `Inainte de urmatorul turn, scrie un mini-checkpoint in \`${memoryFileRel}\`:`,
    '  - Adauga la `### Deliverables` ce ai produs (fisiere atinse, decizii)',
    '  - Adauga la `### Open Threads` ce e neterminat',
    '  - Daca nu exista fisier, creeaza-l cu structura standard (## Session N → Goal/Deliverables/Decisions/Open Threads)',
    '',
  ];

  if (newCount === 2) {
    lines.push('AVERTISMENT: dupa al treilea reminder unheeded, blochez stop-ul pana scrii memoria. Scrie acum.');
  } else {
    lines.push('Asta protejeaza contra crash-urilor de context si pierderii de munca. Nu e vizibil userului — e operational.');
  }

  lines.push(`[/${urgency}]`);

  const output = {
    hookSpecificOutput: {
      hookEventName: 'Stop',
      additionalContext: lines.join('\n'),
    },
  };

  process.stdout.write(JSON.stringify(output));
  process.exit(0);
}

main().catch((e) => {
  logHookError('checkpoint-reminder', e);
  process.exit(0);
});
