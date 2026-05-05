#!/usr/bin/env node
/**
 * activity-capture.js
 *
 * Stop hook handler care citeste transcript-ul real al sesiunii (din ~/.claude/projects/.../<session_id>.jsonl)
 * si extrage ultimul turn (user prompt + tool actions + assistant response).
 *
 * Apendeaza un entry compact la data/activity-log.ndjson — sursa de adevar pentru
 * "ce s-a intamplat in alte sesiuni".
 *
 * Folosit pentru:
 *  - Cross-session memory: noua sesiune Claude poate citi acest fisier (via tool Read)
 *    cand userul intreaba "ce am facut ieri?"
 *  - Hook-ul UserPromptSubmit injecteaza un sumar al ultimelor 5 entries in STARTUP CONTEXT
 *  - Dashboard tab Sistem poate afisa activitatea cross-session
 *
 * Ruleaza paralel cu checkpoint-reminder.js (ambele sunt Stop hooks).
 * Niciodata nu blocheaza — la orice eroare, exit 0 silentios.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { appendNdjson } from './lib/ndjson-log.js';
import { logHookError } from './lib/hook-error-sink.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROBOS_ROOT = join(__dirname, '..');
const ACTIVITY_LOG = join(ROBOS_ROOT, 'data', 'activity-log.ndjson');
const MAX_ENTRIES = 500; // ~150KB max — captureaza ~10-20 sesiuni

/**
 * Redact sensitive token shapes before persisting to activity log.
 *
 * Activity log writes user prompts and assistant text to disk readable
 * via the dashboard `/api/system/activity` endpoint. Without redaction,
 * accidentally pasted credentials would persist for ~10-20 sessions in
 * cleartext on disk.
 *
 * Patterns covered:
 *   - Anthropic / OpenAI / Stripe-style: sk-ant-*, sk-, sk_test_, sk_live_
 *   - Firecrawl: fc-*
 *   - Google API: AIza*
 *   - GitHub PATs: ghp_*, gho_*, ghu_*, ghs_*, ghr_*
 *   - JWT-shaped: eyJ.*\..*\..*
 *   - Generic Bearer prefix: Bearer <token>
 *
 * @param {string} text
 * @returns {string}
 */
function redactSensitive(text) {
  if (typeof text !== 'string' || !text) return text;
  return text
    .replace(/sk-ant-[A-Za-z0-9_-]{20,}/g, 'sk-ant-****')
    .replace(/sk-[A-Za-z0-9_-]{20,}/g, 'sk-****')
    .replace(/sk_(test|live)_[A-Za-z0-9]{20,}/g, 'sk_$1_****')
    .replace(/fc-[A-Za-z0-9]{20,}/g, 'fc-****')
    .replace(/AIza[A-Za-z0-9_-]{20,}/g, 'AIza****')
    .replace(/gh[pousr]_[A-Za-z0-9]{20,}/g, 'gh*_****')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, 'eyJ****.****.****')
    .replace(/Bearer\s+[A-Za-z0-9._-]{20,}/gi, 'Bearer ****');
}

/**
 * Deriva path-ul transcriptului Claude Code din session_id si cwd.
 * Format Windows: C:\Users\<user>\.claude\projects\<sanitized-cwd>\<session_id>.jsonl
 * Sanitizare cwd: lowercase, : / \ _ → -
 */
function findTranscriptFile(sessionId) {
  if (!sessionId || sessionId === 'unknown') return null;

  const projectsDir = join(homedir(), '.claude', 'projects');
  if (!existsSync(projectsDir)) return null;

  // Cautam in toate proiectele care contin "robos" in nume — match cu cwd-ul nostru
  const candidates = readdirSync(projectsDir).filter(d => d.toLowerCase().includes('robos'));
  for (const dir of candidates) {
    const path = join(projectsDir, dir, `${sessionId}.jsonl`);
    if (existsSync(path)) return path;
  }
  return null;
}

/**
 * Citeste ultimele N linii dintr-un fisier NDJSON. Sare peste linii corupte.
 */
function readLastLines(path, n = 50) {
  try {
    const content = readFileSync(path, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    return lines.slice(-n).map(l => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Din transcriptul Claude Code, extrage ULTIMUL turn complet:
 *  - cel mai recent mesaj user (de tip "user" cu role: user, content non-meta)
 *  - assistant response-ul + tool calls dupa el
 *
 * Returneaza un entry compact pentru activity log.
 */
function extractLastTurn(turns) {
  if (turns.length === 0) return null;

  // Gasim ultimul user message non-meta (skip caveats, hooks, attachments)
  let lastUserIdx = -1;
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i];
    if (t.type === 'user' && t.message?.role === 'user' && !t.isMeta) {
      const content = t.message.content;
      // Skip system messages / hook reminders
      if (typeof content === 'string') {
        // Skip pure attachments / system-reminder-only content
        if (content.startsWith('<command-message>') || content.startsWith('<system-reminder>')) continue;
        lastUserIdx = i;
        break;
      } else if (Array.isArray(content)) {
        // Multi-block: cauta primul text block care nu e meta
        const textBlock = content.find(b => b.type === 'text' && b.text && !b.text.startsWith('<system-reminder>'));
        if (textBlock) {
          lastUserIdx = i;
          break;
        }
      }
    }
  }

  if (lastUserIdx === -1) return null;

  const userTurn = turns[lastUserIdx];
  const subsequent = turns.slice(lastUserIdx + 1);

  // Extract user prompt text
  let userPrompt = '';
  const uc = userTurn.message.content;
  if (typeof uc === 'string') userPrompt = uc;
  else if (Array.isArray(uc)) {
    const tb = uc.find(b => b.type === 'text');
    if (tb) userPrompt = tb.text || '';
  }
  userPrompt = redactSensitive(userPrompt).slice(0, 300).replace(/\s+/g, ' ').trim();

  // Extract assistant response + tool calls from subsequent turns
  const toolActions = [];
  let assistantText = '';
  for (const t of subsequent) {
    if (t.type === 'assistant' && t.message?.content) {
      const ac = t.message.content;
      if (Array.isArray(ac)) {
        for (const block of ac) {
          if (block.type === 'text' && block.text) {
            if (!assistantText) assistantText = redactSensitive(block.text).slice(0, 400).replace(/\s+/g, ' ').trim();
          } else if (block.type === 'tool_use') {
            const name = block.name || 'unknown';
            const input = block.input || {};
            // Compact summary based on tool
            let summary = name;
            if (name === 'Edit' || name === 'Write') {
              summary = `${name}:${(input.file_path || '').split(/[\\/]/).pop()}`;
            } else if (name === 'Bash') {
              const cmd = (input.command || '').slice(0, 80).split('\n')[0];
              summary = `Bash:${redactSensitive(cmd)}`;
            } else if (name === 'Read') {
              summary = `Read:${(input.file_path || '').split(/[\\/]/).pop()}`;
            }
            toolActions.push(summary);
          }
        }
      }
    }
  }

  return {
    user_prompt: userPrompt,
    assistant_summary: assistantText,
    tool_actions: toolActions.slice(0, 10),
    cwd: userTurn.cwd || null,
    git_branch: userTurn.gitBranch || null,
  };
}

async function main() {
  if (process.env.ROBOS_ACTIVITY_DISABLED === '1') {
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
  if (sessionId === 'unknown') process.exit(0);

  const transcriptPath = findTranscriptFile(sessionId);
  if (!transcriptPath) process.exit(0);

  const turns = readLastLines(transcriptPath, 80);
  const turn = extractLastTurn(turns);
  if (!turn) process.exit(0);

  const entry = {
    ts: new Date().toISOString(),
    session: sessionId.slice(0, 8),
    ...turn,
  };

  try {
    appendNdjson(ACTIVITY_LOG, entry, { maxLines: MAX_ENTRIES });
  } catch {
    /* never block */
  }

  process.exit(0);
}

main().catch((e) => {
  logHookError('activity-capture', e);
  process.exit(0);
});
