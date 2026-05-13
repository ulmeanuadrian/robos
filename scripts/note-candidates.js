#!/usr/bin/env node
/**
 * note-candidates.js
 *
 * Stop hook handler that scans the most recent turn (user prompt + assistant
 * response) for decision/rule fragments and writes them as PENDING candidates
 * into the `note_candidates` table.
 *
 * The user reviews candidates in batch at the next session start (handled by
 * the UserPromptSubmit hook). Confirmed ones get promoted to real notes;
 * rejected ones stay in the table marked 'rejected' so future heuristic tuning
 * can learn from them.
 *
 * Detection is intentionally conservative — false positives erode the user's
 * trust in the review prompt. Patterns:
 *   - Explicit prefixes:  "Decizie:", "Decid:", "Regula:", "Important:", "Pattern:"
 *   - Strong assertions:  "Niciodata X", "Intotdeauna X" (only if surrounded by content)
 *
 * Code blocks are stripped first to avoid capturing example syntax.
 *
 * Disable: set ROBOS_CANDIDATES_DISABLED=1.
 * Failure: never blocks the Stop event — exit 0 silently, log to error sink.
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { randomBytes } from 'crypto';
import { loadEnv } from './lib/env-loader.js';

// NOTE: db import is DYNAMIC inside main() — centre/lib/db.js requires
// better-sqlite3 which may not be installed if student ran `claude` before
// `node scripts/robos.js` (which triggers setup + npm install). Static import
// would crash this Stop hook with ERR_MODULE_NOT_FOUND at module load, before
// any try/catch could swallow it. Bug observed 2026-05-13.

// Load .env BEFORE any process.env reads (Claude Code spawns hooks with clean env)
loadEnv();
import { logHookError } from './lib/hook-error-sink.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROBOS_ROOT = join(__dirname, '..');

const MAX_CANDIDATES_PER_TURN = 4;
const MIN_EXCERPT_LEN = 20;
const MAX_EXCERPT_LEN = 400;

// ---------- Transcript reading (mirror of activity-capture.js) ----------

function findTranscriptFile(sessionId) {
  if (!sessionId || sessionId === 'unknown') return null;
  const projectsDir = join(homedir(), '.claude', 'projects');
  if (!existsSync(projectsDir)) return null;
  const candidates = readdirSync(projectsDir).filter(d => d.toLowerCase().includes('robos'));
  for (const dir of candidates) {
    const path = join(projectsDir, dir, `${sessionId}.jsonl`);
    if (existsSync(path)) return path;
  }
  return null;
}

function readLastLines(path, n = 80) {
  try {
    const content = readFileSync(path, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    return lines.slice(-n).map(l => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  } catch { return []; }
}

function extractLastTurnTexts(turns) {
  let lastUserIdx = -1;
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i];
    if (t.type === 'user' && t.message?.role === 'user' && !t.isMeta) {
      const c = t.message.content;
      if (typeof c === 'string' && !c.startsWith('<command-message>') && !c.startsWith('<system-reminder>')) {
        lastUserIdx = i; break;
      }
      if (Array.isArray(c)) {
        const tb = c.find(b => b.type === 'text' && b.text && !b.text.startsWith('<system-reminder>'));
        if (tb) { lastUserIdx = i; break; }
      }
    }
  }
  if (lastUserIdx === -1) return null;

  const userTurn = turns[lastUserIdx];
  const subsequent = turns.slice(lastUserIdx + 1);

  let userPrompt = '';
  const uc = userTurn.message.content;
  if (typeof uc === 'string') userPrompt = uc;
  else if (Array.isArray(uc)) {
    const tb = uc.find(b => b.type === 'text');
    if (tb) userPrompt = tb.text || '';
  }

  let assistantText = '';
  for (const t of subsequent) {
    if (t.type === 'assistant' && t.message?.content) {
      const ac = t.message.content;
      if (Array.isArray(ac)) {
        for (const block of ac) {
          if (block.type === 'text' && block.text) {
            assistantText += '\n' + block.text;
          }
        }
      }
    }
  }

  return { userPrompt: userPrompt.trim(), assistantText: assistantText.trim() };
}

// ---------- Detection ----------

/**
 * Strip fenced code blocks and inline code so we don't capture example syntax.
 */
function stripCode(text) {
  return text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
}

/**
 * Strip system reminders, command tags, and our own meta blocks — these are
 * never user knowledge worth capturing.
 */
function stripMeta(text) {
  return text
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
    .replace(/<command-name>[\s\S]*?<\/command-name>/g, '')
    .replace(/<command-message>[\s\S]*?<\/command-message>/g, '')
    .replace(/\[STARTUP CONTEXT[\s\S]*?\[\/STARTUP CONTEXT\]/g, '')
    .replace(/\[SKILL ROUTER\][\s\S]*?\[\/SKILL ROUTER\]/g, '')
    .replace(/\[VERIFICATION DISCIPLINE[\s\S]*?\[\/VERIFICATION DISCIPLINE\]/g, '')
    .replace(/\[CHECKPOINT[\s\S]*?\[\/CHECKPOINT[^\]]*\]/g, '');
}

/**
 * Patterns that fire candidates. Each entry: { trigger, regex }. Regex must
 * contain ONE capture group → the excerpt content.
 *
 * Anchored at line start (^ with /m flag) so we don't catch the word mid-paragraph.
 * Ignored if line starts with `#` (heading) or is inside code (already stripped).
 */
const PATTERNS = [
  { trigger: 'decizie',   re: /^[\s\-*]*(?:Decizie|Decid)\s*:\s*(.+?)\s*$/gim },
  { trigger: 'regula',    re: /^[\s\-*]*(?:Regula|Rule)\s*:\s*(.+?)\s*$/gim },
  { trigger: 'important', re: /^[\s\-*]*Important\s*:\s*(.+?)\s*$/gim },
  { trigger: 'tine-minte',re: /^[\s\-*]*(?:Tine minte|Remember)\s*:\s*(.+?)\s*$/gim },
];

function detectCandidates(text) {
  const cleaned = stripCode(stripMeta(text || ''));
  const out = [];
  const seen = new Set();

  for (const p of PATTERNS) {
    p.re.lastIndex = 0;
    let m;
    while ((m = p.re.exec(cleaned)) !== null) {
      const excerpt = m[1].trim();
      if (excerpt.length < MIN_EXCERPT_LEN) continue;
      if (excerpt.length > MAX_EXCERPT_LEN) continue;
      // Skip lines that are obviously meta/headings.
      if (/^#{1,6}\s/.test(excerpt)) continue;
      // Skip placeholder/example lines.
      if (/^(exemplu|example|e\.g\.)/i.test(excerpt)) continue;

      const key = excerpt.slice(0, 80).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      out.push({ trigger: p.trigger, excerpt });
      if (out.length >= MAX_CANDIDATES_PER_TURN) return out;
    }
  }
  return out;
}

function buildCandidateId(trigger) {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const suffix = randomBytes(2).toString('hex');
  return `cand-${y}-${m}-${d}-${hh}${mm}-${suffix}`;
}

// ---------- Main ----------

async function main() {
  if (process.env.ROBOS_CANDIDATES_DISABLED === '1') process.exit(0);

  let payload = {};
  try {
    const stdin = readFileSync(0, 'utf-8');
    payload = stdin.trim() ? JSON.parse(stdin) : {};
  } catch { process.exit(0); }

  const sessionId = payload.session_id || 'unknown';
  if (sessionId === 'unknown') process.exit(0);

  const transcriptPath = findTranscriptFile(sessionId);
  if (!transcriptPath) {
    // F17 fix: log to error sink so the operator can diagnose silent breakage
    // (e.g. Claude Code transcript path changed between releases).
    try {
      logHookError('note-candidates:transcript-not-found', new Error('transcript missing'), {
        sessionId,
        homedir: homedir(),
        hint: 'Claude Code transcript not found in ~/.claude/projects/*; auto-capture degraded',
      });
    } catch { /* best effort */ }
    process.exit(0);
  }

  const turns = readLastLines(transcriptPath, 80);
  const texts = extractLastTurnTexts(turns);
  if (!texts) process.exit(0);

  // Detect across both user prompt AND assistant response. User-authored
  // assertions get higher weight implicitly because users write fewer words —
  // any "regula:" they type is almost always real signal.
  const fromUser = detectCandidates(texts.userPrompt);
  const fromAssistant = detectCandidates(texts.assistantText);

  // Cap merged set; user-side first.
  const merged = [...fromUser, ...fromAssistant].slice(0, MAX_CANDIDATES_PER_TURN);
  if (merged.length === 0) process.exit(0);

  // Dynamic import — if better-sqlite3 is missing (setup didn't run yet),
  // we log to the error sink and exit silently instead of crashing the Stop
  // hook. The user sees a clean session; the operator can diagnose via
  // data/hook-errors.ndjson.
  let getDb, closeDb;
  try {
    ({ getDb, closeDb } = await import('../centre/lib/db.js'));
  } catch (e) {
    logHookError('note-candidates:db-unavailable', e, {
      hint: 'centre/node_modules missing — run `node scripts/robos.js` to trigger setup',
    });
    process.exit(0);
  }

  let db;
  try {
    db = getDb();
    const insert = db.prepare(`
      INSERT INTO note_candidates (id, session_id, trigger, excerpt, status)
      VALUES (?, ?, ?, ?, 'pending')
    `);
    const tx = db.transaction(() => {
      for (const c of merged) {
        insert.run(buildCandidateId(c.trigger), sessionId.slice(0, 32), c.trigger, c.excerpt);
      }
    });
    tx();
  } catch (e) {
    logHookError('note-candidates', e);
  } finally {
    try { closeDb(); } catch {}
  }

  process.exit(0);
}

main().catch((e) => {
  logHookError('note-candidates', e);
  process.exit(0);
});
