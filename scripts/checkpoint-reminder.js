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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROBOS_ROOT = join(__dirname, '..');
const MEMORY_DIR = join(ROBOS_ROOT, 'context', 'memory');
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
 * Returneaza un timestamp ms sau null daca fisierul nu exista.
 */
function lastMemoryWriteMs() {
  const path = join(MEMORY_DIR, `${todayISO()}.md`);
  if (!existsSync(path)) return null;
  try {
    return statSync(path).mtimeMs;
  } catch {
    return null;
  }
}

/**
 * Citeste timpul ultimului checkpoint reminder pentru aceasta sesiune.
 * Stocat in data/session-state/{session_id}-checkpoint.json.
 * Folosit ca sa nu spam-am reminders la fiecare turn.
 */
function readLastReminderMs(sessionId) {
  const path = join(STATE_DIR, `${sessionId}-checkpoint.json`);
  if (!existsSync(path)) return 0;
  try {
    const data = JSON.parse(readFileSync(path, 'utf-8'));
    return data.last_reminder_ms || 0;
  } catch {
    return 0;
  }
}

function writeLastReminderMs(sessionId, ms) {
  ensureDir(STATE_DIR);
  const path = join(STATE_DIR, `${sessionId}-checkpoint.json`);
  writeFileSync(path, JSON.stringify({ last_reminder_ms: ms }, null, 2));
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

  const sessionId = payload.session_id || 'unknown';
  const now = Date.now();
  const thresholdMs = DEFAULT_THRESHOLD_MIN * 60 * 1000;

  const lastWrite = lastMemoryWriteMs();
  const lastReminder = readLastReminderMs(sessionId);

  // Caz 1: nu exista memorie pentru azi → reminder daca sesiunea a inceput de >threshold
  // (ne uitam la session marker)
  if (!lastWrite) {
    const sessionMarker = join(STATE_DIR, `${sessionId}.json`);
    if (existsSync(sessionMarker)) {
      try {
        const data = JSON.parse(readFileSync(sessionMarker, 'utf-8'));
        const startedMs = new Date(data.started_at).getTime();
        if ((now - startedMs) > thresholdMs && (now - lastReminder) > thresholdMs) {
          emitReminder(sessionId, now, 'no_memory_file_yet', null);
          return;
        }
      } catch { /* noop */ }
    }
    process.exit(0);
  }

  // Caz 2: memorie exista, dar nu a fost atinsa de >threshold
  const sinceWrite = now - lastWrite;
  if (sinceWrite > thresholdMs && (now - lastReminder) > thresholdMs) {
    emitReminder(sessionId, now, 'memory_stale', sinceWrite);
    return;
  }

  process.exit(0);
}

function emitReminder(sessionId, now, reason, sinceWriteMs) {
  writeLastReminderMs(sessionId, now);

  const minSince = sinceWriteMs ? Math.floor(sinceWriteMs / 60000) : null;
  const reasonText = reason === 'no_memory_file_yet'
    ? 'Sesiunea ruleaza de mai mult de pragul de checkpoint si memoria zilei nu a fost creata inca.'
    : `Memoria zilei nu a fost actualizata de ${minSince} minute.`;

  const lines = [
    '[CHECKPOINT REMINDER]',
    reasonText,
    '',
    'Inainte de urmatorul turn, scrie un mini-checkpoint in `context/memory/YYYY-MM-DD.md`:',
    '  - Adauga la `### Deliverables` ce ai produs (fisiere atinse, decizii)',
    '  - Adauga la `### Open Threads` ce e neterminat',
    '  - Daca nu exista fisier, creeaza-l cu structura standard (## Session N → Goal/Deliverables/Decisions/Open Threads)',
    '',
    'Asta protejeaza contra crash-urilor de context si pierderii de munca. Nu e vizibil userului — e operational.',
    '[/CHECKPOINT REMINDER]',
  ];

  const output = {
    hookSpecificOutput: {
      hookEventName: 'Stop',
      additionalContext: lines.join('\n'),
    },
  };

  process.stdout.write(JSON.stringify(output));
  process.exit(0);
}

main().catch(() => process.exit(0));
