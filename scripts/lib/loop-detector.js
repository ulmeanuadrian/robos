/**
 * loop-detector.js
 *
 * Detects when the model is stuck calling the same tool with identical input
 * repeatedly within a single session. Emits a warning that gets injected into
 * the model's context via the PostToolUse hook so it can break the loop.
 *
 * State per session in data/session-state/{session_id}-tools.json:
 *   {
 *     session_id, last_call_hash, last_call_summary,
 *     consecutive_count, warnings_issued, total_calls, updated_at
 *   }
 *
 * Logic:
 *   - Hash = SHA256(toolName + canonicalJson(toolInput)).slice(0, 12)
 *   - Same hash as previous call → consecutive_count++
 *   - Different hash → consecutive_count=1, warnings_issued=0 (interleaved
 *     work is the natural reset signal)
 *   - consecutive_count == threshold && warnings_issued == 0 → emit warning
 *   - consecutive_count == threshold * 2 && warnings_issued == 1 → emit
 *     escalated warning (one second-tier nudge, then silent)
 *
 * Env knobs (read at each call so changes apply without restart):
 *   ROBOS_LOOP_DETECTOR_DISABLED=1      → skip detection entirely
 *   ROBOS_LOOP_DETECTOR_THRESHOLD=N     → consecutive count to warn (default 3)
 *   ROBOS_LOOP_DETECTOR_EXEMPT=A,B,C    → comma-separated tool names exempt
 *
 * Failure mode: never throws. Corrupt state → reset. Disk error → return
 * { warning: null } silently. Caller should always exit 0.
 */

import { readFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import { atomicWrite } from './atomic-write.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROBOS_ROOT = join(__dirname, '..', '..');
const STATE_DIR = join(ROBOS_ROOT, 'data', 'session-state');

// Cap input size hashed to keep latency bounded — 50 KB is more than any
// reasonable tool input. Beyond that we hash a truncated copy; collisions
// across different >50 KB inputs are still vanishingly improbable for
// SHA256, and "loop on giant identical inputs" remains detected.
const MAX_HASH_INPUT_BYTES = 50 * 1024;

// Sanitize session_id used as path component (defense in depth — Claude Code
// sends UUIDs but state file path must never accept arbitrary input).
const SESSION_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

const DEFAULT_THRESHOLD = 3;
const DEFAULT_EXEMPT = ['TodoWrite'];

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

// atomicWrite extracted to scripts/lib/atomic-write.js (F4 fix — adds Windows
// EBUSY/EPERM retry + try/finally tmp cleanup). Re-import below.

/**
 * Canonicalize JSON so that {a:1,b:2} and {b:2,a:1} produce identical strings.
 * Recursive sort of object keys; arrays kept in original order (order matters).
 */
export function canonicalJson(obj) {
  if (obj === null || obj === undefined) return JSON.stringify(obj === undefined ? null : obj);
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(canonicalJson).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') + '}';
}

/**
 * Stable, short hash of (tool_name, tool_input).
 */
export function hashCall(toolName, toolInput) {
  let serialized;
  try {
    serialized = canonicalJson(toolInput);
  } catch {
    serialized = String(toolInput);
  }
  if (serialized.length > MAX_HASH_INPUT_BYTES) {
    serialized = serialized.slice(0, MAX_HASH_INPUT_BYTES);
  }
  return createHash('sha256')
    .update(String(toolName) + ':' + serialized)
    .digest('hex')
    .slice(0, 12);
}

/**
 * Build a short, human-readable summary of the call (for warnings + state file).
 * Mirrors activity-capture.js conventions so the operator sees consistent labels.
 */
export function summarizeCall(toolName, toolInput) {
  const i = toolInput || {};
  const trim = (s, n = 60) => String(s || '').slice(0, n).split('\n')[0];
  switch (toolName) {
    case 'Read': return `Read:${trim(i.file_path).split(/[\\/]/).pop()}`;
    case 'Write': return `Write:${trim(i.file_path).split(/[\\/]/).pop()}`;
    case 'Edit': return `Edit:${trim(i.file_path).split(/[\\/]/).pop()}`;
    case 'Bash': return `Bash:${trim(i.command, 50)}`;
    case 'Grep': return `Grep:${trim(i.pattern, 30)}`;
    case 'Glob': return `Glob:${trim(i.pattern, 30)}`;
    default: return String(toolName || 'unknown');
  }
}

function parseExemptList(env) {
  const raw = env.ROBOS_LOOP_DETECTOR_EXEMPT;
  if (raw === undefined) return DEFAULT_EXEMPT;
  if (raw === '') return [];
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

function getThreshold(env) {
  const raw = env.ROBOS_LOOP_DETECTOR_THRESHOLD;
  if (!raw) return DEFAULT_THRESHOLD;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 2) return DEFAULT_THRESHOLD;
  return n;
}

function statePath(sessionId) {
  return join(STATE_DIR, `${sessionId}-tools.json`);
}

function readState(sessionId) {
  const path = statePath(sessionId);
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(readFileSync(path, 'utf-8'));
    if (data && typeof data === 'object' && typeof data.last_call_hash === 'string') {
      return data;
    }
    return null;
  } catch {
    return null; // corrupt → reset
  }
}

function writeState(sessionId, state) {
  try {
    atomicWrite(statePath(sessionId), JSON.stringify(state, null, 2));
  } catch {
    /* disk error — non-fatal, advisory subsystem */
  }
}

function buildWarning({ tier, hash, summary, consecutive_count, threshold }) {
  if (tier === 1) {
    return [
      '[LOOP DETECTOR]',
      `Detectat ${consecutive_count} apeluri identice consecutive: ${summary} (hash ${hash}).`,
      'Verifica daca acest pas progreseaza efectiv. Daca nu, schimba abordarea:',
      '  - alt fisier sau alt search pattern',
      '  - alt instrument (Grep in loc de Read repetat, Glob in loc de Bash ls)',
      '  - intreaba operatorul daca pare blocat',
      '[/LOOP DETECTOR]',
    ].join('\n');
  }
  // Tier 2 (escalated): more strict language
  return [
    '[LOOP DETECTOR — al doilea avertisment]',
    `${consecutive_count} apeluri identice consecutive (${summary}, hash ${hash}). Primul avertisment a fost ignorat.`,
    'OPRESTE-TE. Schimbarea abordarii nu mai e optional. Daca nu vezi alt drum, raspunde user-ului cu ce ai incercat si cere directie.',
    '[/LOOP DETECTOR]',
  ].join('\n');
}

/**
 * Record a tool call and return whether to warn.
 *
 * @param {string} sessionId
 * @param {string} toolName
 * @param {object} toolInput
 * @param {object} [opts]
 * @param {object} [opts.env]  // for testing — defaults to process.env
 * @returns {{warning: string|null, consecutive_count: number, hash: string, exempt: boolean, disabled: boolean}}
 */
export function recordCall(sessionId, toolName, toolInput, opts = {}) {
  const env = opts.env || process.env;

  if (env.ROBOS_LOOP_DETECTOR_DISABLED === '1') {
    return { warning: null, consecutive_count: 0, hash: '', exempt: false, disabled: true };
  }
  if (!sessionId || typeof sessionId !== 'string' || !SESSION_ID_RE.test(sessionId)) {
    return { warning: null, consecutive_count: 0, hash: '', exempt: false, disabled: false, skipped: 'invalid_session' };
  }
  if (!toolName || typeof toolName !== 'string') {
    return { warning: null, consecutive_count: 0, hash: '', exempt: false, disabled: false, skipped: 'no_tool' };
  }

  const threshold = getThreshold(env);
  const exempt = parseExemptList(env);
  const isExempt = exempt.includes(toolName);

  const hash = hashCall(toolName, toolInput);
  const summary = summarizeCall(toolName, toolInput);

  const prev = readState(sessionId);
  const now = new Date().toISOString();

  let consecutive_count;
  let warnings_issued;
  if (prev && prev.last_call_hash === hash) {
    consecutive_count = (prev.consecutive_count || 0) + 1;
    warnings_issued = prev.warnings_issued || 0;
  } else {
    consecutive_count = 1;
    warnings_issued = 0; // reset on different call
  }

  const next = {
    session_id: sessionId,
    last_call_hash: hash,
    last_call_summary: summary,
    consecutive_count,
    warnings_issued,
    total_calls: (prev?.total_calls || 0) + 1,
    updated_at: now,
  };

  let warning = null;
  if (!isExempt) {
    if (consecutive_count === threshold && warnings_issued === 0) {
      warning = buildWarning({ tier: 1, hash, summary, consecutive_count, threshold });
      next.warnings_issued = 1;
    } else if (consecutive_count === threshold * 2 && warnings_issued === 1) {
      warning = buildWarning({ tier: 2, hash, summary, consecutive_count, threshold });
      next.warnings_issued = 2;
    }
  }

  writeState(sessionId, next);

  return {
    warning,
    consecutive_count,
    hash,
    exempt: isExempt,
    disabled: false,
    summary,
  };
}

/**
 * Reset state for a session. Used by tests + future cleanup.
 */
export function resetSession(sessionId) {
  if (!sessionId || !SESSION_ID_RE.test(sessionId)) return false;
  const path = statePath(sessionId);
  if (existsSync(path)) {
    try { unlinkSync(path); } catch { /* ignore */ }
  }
  return true;
}
