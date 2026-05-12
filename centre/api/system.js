import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, statSync } from 'fs';
import { join, resolve, relative } from 'path';
import { spawn } from 'child_process';
import { workspaceRoot } from '../lib/config.js';
import { getMemoryDir, getActiveClient, resolveContextPath, isValidSlug, getClientsDir, getRobosRoot } from '../../scripts/lib/client-context.js';
import { validateRunSkillArgs } from '../../scripts/lib/args-validator.js';
import { atomicWrite } from '../../scripts/lib/atomic-write.js';

// Activity/audit/timeout/learnings-aggregate logs stay GLOBAL — cross-client
// visibility is useful (the operator audits one disk regardless of which client
// they're working on). Memory and learnings.md, however, route per active
// client via getMemoryDir() / resolveContextPath().
const DATA_DIR = join(workspaceRoot, 'data');
const AUDIT_LOG = join(DATA_DIR, 'startup-audit.log');
const TIMEOUT_LOG = join(DATA_DIR, 'session-timeout.log');
const LEARNINGS_LOG = join(DATA_DIR, 'learnings-aggregate.log');
const ACTIVITY_LOG = join(DATA_DIR, 'activity-log.ndjson');

function memoryDir() {
  return getMemoryDir();
}
function learningsFile() {
  return resolveContextPath('context/learnings.md');
}

/**
 * Resolve memory dir for an explicit scope (overrides current active client).
 * S21 fix: callers that read a memory file from scope X must write back to
 * scope X regardless of whether the active client changed between read and
 * write. Without this, switching client mid-edit silently re-routed saves to
 * the wrong workspace.
 *
 * @param {'root' | string} scope - 'root', null/undefined (use active), or a client slug.
 * @returns {string} absolute memory dir
 */
function memoryDirForScope(scope) {
  if (scope === null || scope === undefined) return memoryDir();
  if (scope === 'root') return join(getRobosRoot(), 'context', 'memory');
  if (typeof scope !== 'string' || !isValidSlug(scope)) {
    const err = new Error(`Invalid scope: "${scope}" (use "root" or a valid client slug)`);
    err.statusCode = 400;
    throw err;
  }
  const clientDir = join(getClientsDir(), scope);
  if (!existsSync(clientDir)) {
    const err = new Error(`Client "${scope}" not found`);
    err.statusCode = 404;
    throw err;
  }
  return join(clientDir, 'context', 'memory');
}

/**
 * Citeste un fisier NDJSON. Returneaza array de obiecte (cele mai recente primele).
 * Limit: max ultimele N linii (default 100).
 */
function readNdjson(path, limit = 100) {
  if (!existsSync(path)) return [];
  try {
    const content = readFileSync(path, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    const recent = lines.slice(-limit).reverse();
    return recent.map(l => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * GET /api/system/audit-log — Audit history (startup audits + session timeouts).
 */
export function getAuditHistory() {
  return {
    startup: readNdjson(AUDIT_LOG, 50),
    session_timeouts: readNdjson(TIMEOUT_LOG, 50),
    learnings_reviews: readNdjson(LEARNINGS_LOG, 20),
  };
}

/**
 * GET /api/system/activity — recent cross-session activity (from activity-log.ndjson).
 * Query: ?limit=N (default 50, max 500), ?since=YYYY-MM-DD (optional date filter)
 */
export function getActivity(query = {}) {
  const limit = Math.min(parseInt(query.limit, 10) || 50, 500);
  const since = query.since && /^\d{4}-\d{2}-\d{2}$/.test(query.since) ? query.since : null;

  const entries = readNdjson(ACTIVITY_LOG, limit);
  if (!since) return { count: entries.length, entries };

  const filtered = entries.filter(e => (e.ts || '').slice(0, 10) >= since);
  return { count: filtered.length, entries: filtered, since };
}

/**
 * GET /api/system/memory — list memory files with metadata.
 */
export function listMemory() {
  if (!existsSync(memoryDir())) return [];
  const files = readdirSync(memoryDir())
    .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .sort()
    .reverse();
  return files.map(f => {
    const path = join(memoryDir(), f);
    const stat = statSync(path);
    const content = readFileSync(path, 'utf-8');
    const sessionCount = (content.match(/^##\s+Session\s+\d+/gm) || []).length;
    const closed = /Session:\s*\d+\s*deliverables/i.test(content);
    return {
      date: f.replace(/\.md$/, ''),
      filename: f,
      bytes: stat.size,
      mtime: stat.mtime.toISOString(),
      sessionCount,
      closed,
    };
  });
}

/**
 * GET /api/system/memory/:date — read a memory file.
 *
 * @param {string} date - YYYY-MM-DD
 * @param {object} [opts]
 * @param {'root' | string} [opts.scope] - explicit workspace scope (else active).
 */
export function getMemoryFile(date, opts = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const err = new Error('Invalid date format (expected YYYY-MM-DD)');
    err.statusCode = 400;
    throw err;
  }
  const dir = memoryDirForScope(opts.scope);
  const path = join(dir, `${date}.md`);
  if (!existsSync(path)) return null;
  const stat = statSync(path);
  return {
    date,
    content: readFileSync(path, 'utf-8'),
    // S21 fix: return mtime so the UI can echo it back in If-Match on save.
    // Together with scope, this gives optimistic concurrency + scope-correct
    // writes even when the active client changed between read and save.
    mtime: stat.mtime.toISOString(),
    scope: opts.scope || (getActiveClient()?.slug || 'root'),
  };
}

/**
 * PUT /api/system/memory/:date — write a memory file.
 * Safety: rejects writes outside memoryDir(); preserves backup of previous version.
 *
 * @param {string} date - YYYY-MM-DD
 * @param {string} content - markdown body
 * @param {object} [opts]
 * @param {'root' | string} [opts.scope] - explicit workspace scope. If passed,
 *   write goes to this scope (S21 fix: prevents cross-client contamination
 *   when active client changes between client reads and tab saves). If null/
 *   omitted, uses current active client.
 * @param {string} [opts.ifMatch] - optional ISO mtime previously read. If
 *   provided and the file on disk has a different mtime, the write is rejected
 *   with statusCode 409 (optimistic concurrency).
 */
export function saveMemoryFile(date, content, opts = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const err = new Error('Invalid date format (expected YYYY-MM-DD)');
    err.statusCode = 400;
    throw err;
  }
  if (typeof content !== 'string') {
    const err = new Error('content must be a string');
    err.statusCode = 400;
    throw err;
  }
  if (content.length > 5 * 1024 * 1024) {
    const err = new Error('content too large (max 5MB)');
    err.statusCode = 400;
    throw err;
  }

  const dir = memoryDirForScope(opts.scope);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const path = join(dir, `${date}.md`);

  // Verify path stays within dir (paranoia check)
  const rel = relative(dir, resolve(path));
  if (rel.startsWith('..') || rel.includes(':')) {
    const err = new Error('path escape detected');
    err.statusCode = 400;
    throw err;
  }

  // Optimistic concurrency: caller may pass If-Match (the mtime they saw when
  // they read). If file changed since then, reject with 409 so the UI can
  // refresh + merge instead of silently overwriting.
  if (opts.ifMatch && existsSync(path)) {
    const currentMtime = statSync(path).mtime.toISOString();
    if (currentMtime !== opts.ifMatch) {
      const err = new Error('Memory file changed since you read it. Refresh and retry.');
      err.statusCode = 409;
      err.current_mtime = currentMtime;
      throw err;
    }
  }

  // Backup if file exists
  if (existsSync(path)) {
    const backupDir = join(DATA_DIR, 'memory-backups');
    if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    writeFileSync(join(backupDir, `${date}-${ts}.md`), readFileSync(path, 'utf-8'));
  }

  // S22 fix (BLOCKER from 2026-05-12 codex audit): atomic write so a crash
  // mid-write cannot leave a partial memory file. atomicWrite uses temp+rename
  // with random suffix + Windows EBUSY retry. Backup above remains a plain
  // write — backup filename is unique per timestamp, no race possible.
  atomicWrite(path, content, { encoding: 'utf-8' });
  return { date, bytes: content.length, saved_at: new Date().toISOString() };
}

/**
 * GET /api/system/learnings — read context/learnings.md.
 */
export function getLearnings() {
  if (!existsSync(learningsFile())) {
    return { content: '', sections: [] };
  }
  const content = readFileSync(learningsFile(), 'utf-8');

  // Extract section names (## headers)
  const sections = [...content.matchAll(/^##\s+([^\n]+)/gm)].map(m => m[1].trim());

  return {
    content,
    sections,
    bytes: content.length,
  };
}

/**
 * GET /api/system/connections-health — test configured API keys.
 * Returns object: { firecrawl: 'ok'|'error'|'unset', openai: ..., xai: ..., whatsapp: ... }
 *
 * NOTE: These are LIGHT pings. Some hit dummy endpoints to avoid using paid quota.
 */
export async function getConnectionHealth() {
  const results = {};
  const env = process.env;

  // Firecrawl: GET /v1/team/credit-usage. ZERO credit cost (read-only metadata),
  // returns 200 with valid key, 401/403 with bad key. Replaces a /v1/scrape ping
  // that consumed 1 credit per dashboard refresh.
  results.firecrawl = await pingApi(env.FIRECRAWL_API_KEY, async (key) => {
    const res = await fetch('https://api.firecrawl.dev/v1/team/credit-usage', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${key}` },
      signal: AbortSignal.timeout(5000),
    });
    if (res.status === 200) return 'ok';
    if (res.status === 401 || res.status === 403) return 'error';
    // Older accounts may not expose /team — fallback: any non-auth-error response
    // with a valid-shaped key is "ok-ish".
    if (res.status >= 400 && res.status < 500 && res.status !== 402) return `unknown_${res.status}`;
    return res.status >= 200 && res.status < 300 ? 'ok' : `unknown_${res.status}`;
  });

  // OpenAI: GET /models
  results.openai = await pingApi(env.OPENAI_API_KEY, async (key) => {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { 'Authorization': `Bearer ${key}` },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) return 'ok';
    if (res.status === 401) return 'error';
    return `unknown_${res.status}`;
  });

  // X AI: GET /models
  results.xai = await pingApi(env.XAI_API_KEY, async (key) => {
    const res = await fetch('https://api.x.ai/v1/models', {
      headers: { 'Authorization': `Bearer ${key}` },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) return 'ok';
    if (res.status === 401) return 'error';
    return `unknown_${res.status}`;
  });

  // WhatsApp Cloud API: GET phone number details
  if (env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID) {
    try {
      const res = await fetch(`https://graph.facebook.com/v20.0/${env.WHATSAPP_PHONE_NUMBER_ID}`, {
        headers: { 'Authorization': `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` },
        signal: AbortSignal.timeout(5000),
      });
      results.whatsapp = res.ok ? 'ok' : (res.status === 401 ? 'error' : `unknown_${res.status}`);
    } catch (e) {
      results.whatsapp = `network_error:${e.message?.slice(0, 50)}`;
    }
  } else {
    results.whatsapp = 'unset';
  }

  // Anthropic Claude API: GET /v1/models
  results.anthropic = await pingApi(env.ANTHROPIC_API_KEY, async (key) => {
    const res = await fetch('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) return 'ok';
    if (res.status === 401) return 'error';
    return `unknown_${res.status}`;
  });

  return {
    checked_at: new Date().toISOString(),
    results,
  };
}

async function pingApi(key, pingFn) {
  if (!key || key.trim() === '' || key.startsWith('xxxx')) return 'unset';
  try {
    return await pingFn(key);
  } catch (e) {
    return `network_error:${(e.message || '').slice(0, 50)}`;
  }
}

/**
 * POST /api/system/skills/:name/run — invoca un skill via spawn `claude -p`.
 * Returneaza imediat (fire-and-forget). Output-ul se logheaza in cron/logs/skill-run-{slug}.log.
 *
 * Body: { args?: string }   — optional argumente in plus pentru prompt
 *
 * Securitate:
 *  - skillName: regex strict (lowercase + cifre + liniute)
 *  - args: respinge metacaractere shell (`, $, ;, |, &, <, >, \, newlines)
 *  - spawn fara shell: true (argv passed direct, fara interpretare shell)
 */

// Args validation moved to scripts/lib/args-validator.js (single source of
// truth, testable by smoke-args-validation.js without spawning runSkill).
// See lib for full threat-model rationale.

export function runSkill(skillName, body = {}) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(skillName)) {
    const err = new Error('Invalid skill name');
    err.statusCode = 400;
    throw err;
  }

  const skillDir = join(workspaceRoot, 'skills', skillName);
  if (!existsSync(join(skillDir, 'SKILL.md'))) {
    return null;
  }

  let args = '';
  if (body.args && typeof body.args === 'string') {
    args = body.args.trim();
    const v = validateRunSkillArgs(args);
    if (!v.ok) {
      const err = new Error(v.error);
      err.statusCode = 400;
      throw err;
    }
  }

  const prompt = args
    ? `Use skill ${skillName}. Input: ${args}`
    : `Use skill ${skillName} now.`;

  const logsDir = join(workspaceRoot, 'cron', 'logs');
  if (!existsSync(logsDir)) mkdirSync(logsDir, { recursive: true });
  const logFile = join(logsDir, `skill-run-${skillName}-${Date.now()}.log`);

  // shell: false — argv-ul e pasat direct la executabil, fara interpretare shell.
  // Pe Windows, .cmd/.bat fail-uiesc fara shell, dar `claude` e .exe (sau bash script via pnpm).
  // Daca PATH-ul nu rezolva claude direct, user-ul are flexibilitatea sa seteze CLAUDE_BIN env var.
  const claudeBin = process.env.CLAUDE_BIN || 'claude';
  const child = spawn(claudeBin, ['-p', prompt], {
    cwd: workspaceRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
    shell: false,
    detached: true,
    windowsHide: true,
  });

  let output = '';
  child.stdout?.on('data', d => { output += d.toString(); });
  child.stderr?.on('data', d => { output += d.toString(); });
  child.on('close', (code) => {
    try {
      writeFileSync(logFile, `Exit: ${code}\n\n${output}`, 'utf-8');
    } catch { /* ignore */ }
  });
  child.on('error', (err) => {
    try {
      writeFileSync(logFile, `Spawn error: ${err.message}\n`, 'utf-8');
    } catch { /* ignore */ }
  });
  child.unref();

  return {
    skill: skillName,
    started_at: new Date().toISOString(),
    log_file: relative(workspaceRoot, logFile).replace(/\\/g, '/'),
    pid: child.pid,
  };
}
