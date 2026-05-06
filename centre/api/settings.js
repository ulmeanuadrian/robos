import { readFileSync, writeFileSync, existsSync, copyFileSync, renameSync } from 'fs';
import { join } from 'path';
import { workspaceRoot } from '../lib/config.js';
import {
  parseEnvFile,
  parseEnv,
  renderEnv,
  validateValue,
  validateKey,
  valueStatus,
} from '../../scripts/lib/env-format.js';

const ENV_PATH = join(workspaceRoot, '.env');
const ENV_BAK_PATH = join(workspaceRoot, '.env.bak');
const ENV_TMP_PATH = join(workspaceRoot, '.env.tmp');
const REQUIRED_SECRETS_PATH = join(workspaceRoot, 'data', 'required-secrets.json');

// Keys that contain secrets — never returned in plaintext, even to localhost UI.
// Match is substring-based against the key name (uppercase).
const SECRET_PATTERNS = ['KEY', 'SECRET', 'TOKEN', 'PASSWORD', 'PASS', 'PRIVATE', 'CREDENTIAL', 'DSN', 'AUTH'];

// Keys that look like paths or non-secret config — value is exposed plain.
// (Path env vars are not secrets; their values are needed for UX.)
const NON_SECRET_OVERRIDES = new Set([
  'LICENSE_JWT_PRIVATE_KEY_PATH',
  'LICENSE_JWT_PUBLIC_KEY_PATH',
]);

function isSecret(key) {
  if (NON_SECRET_OVERRIDES.has(key)) return false;
  return SECRET_PATTERNS.some(p => key.includes(p));
}

/**
 * Read banner-style category headings (lines like `# │ CORE — ...`) so we can
 * tag each entry with its category. Returns array of { line, category } where
 * we walk the parsed entries top-down, tracking current category.
 */
function inferCategories(entries) {
  // Banner pattern: a comment line containing one of the keywords, framed by │
  const BANNER_RE = /^#\s*[│|]\s*(CORE|SKILLS|DISTRIBUTION)\b/i;
  const FALLBACK_RE = /^#\s*===\s*([^=]+?)\s*===/; // older "=== XXX ===" style

  let current = 'general';
  const tagged = [];
  for (const entry of entries) {
    if (entry.kind === 'comment') {
      const m1 = entry.line.match(BANNER_RE);
      if (m1) current = m1[1].toLowerCase();
      else {
        const m2 = entry.line.match(FALLBACK_RE);
        if (m2) {
          const label = m2[1].trim().toLowerCase();
          if (label.includes('core') || label.includes('dashboard')) current = 'core';
          else if (label.includes('cloudflare') || label.includes('domain') || label.includes('email') || label.includes('license') || label.includes('github') || label.includes('plata') || label.includes('admin')) current = 'distribution';
          else current = 'skills';
        }
      }
    }
    tagged.push({ entry, category: current });
  }
  return tagged;
}

/**
 * Read data/required-secrets.json (built by rebuild-index from skill frontmatter).
 * Returns: Map<key, { required_by: string[], optional_for: string[] }>
 */
function readRequiredSecrets() {
  const map = new Map();
  if (!existsSync(REQUIRED_SECRETS_PATH)) return map;
  try {
    const data = JSON.parse(readFileSync(REQUIRED_SECRETS_PATH, 'utf-8'));
    if (data && typeof data === 'object') {
      for (const [key, info] of Object.entries(data.by_key || {})) {
        map.set(key, {
          required_by: Array.isArray(info?.required_by) ? info.required_by : [],
          optional_for: Array.isArray(info?.optional_for) ? info.optional_for : [],
        });
      }
    }
  } catch {
    // ignore — best effort
  }
  return map;
}

/**
 * GET /api/settings/env — list all env entries WITH metadata, but never the
 * value of secret keys. Non-secret keys (PORT, paths, toggles) include value
 * for UX (so the user can see "PORT=3001" in the UI).
 *
 * Shape:
 *   {
 *     entries: [
 *       { key, value: string|null, masked: bool, status, category, required_by, optional_for }
 *     ],
 *     warnings: [...]
 *   }
 *
 * SECURITY: This response is gated behind Bearer auth — only the local UI
 * (which has the token) can read it. But even so, secret values are NEVER
 * returned. Defense in depth.
 */
export function getEnv() {
  if (!existsSync(ENV_PATH)) {
    return { entries: [], warnings: ['.env does not exist. Run: node scripts/setup-env.js'] };
  }
  const parsed = parseEnvFile(ENV_PATH);
  const tagged = inferCategories(parsed.entries);
  const requiredMap = readRequiredSecrets();

  const entries = [];
  for (const { entry, category } of tagged) {
    if (entry.kind !== 'assignment') continue;
    const secret = isSecret(entry.key);
    const status = valueStatus(entry.value);
    const meta = requiredMap.get(entry.key) || { required_by: [], optional_for: [] };
    entries.push({
      key: entry.key,
      value: secret ? null : entry.value,
      masked: secret,
      status,
      category,
      required_by: meta.required_by,
      optional_for: meta.optional_for,
    });
  }

  return { entries, warnings: [] };
}

/**
 * PUT /api/settings/env — update one or more env values.
 *
 * Accepts EITHER:
 *   { key: "FIRECRAWL_API_KEY", value: "fc-..." }    // single update
 *   { updates: [{ key, value }, ...] }                // batch
 *
 * Behavior:
 *   - Each key must already exist in .env (no key creation via API; for that,
 *     run setup-env.js so slots come from .env.example or skill declarations).
 *   - Existing comments and section banners are preserved (env-format.js parses
 *     line-by-line).
 *   - Atomic: writes to .env.tmp then renames; backup stored in .env.bak.
 *   - Reject empty payload (no updates).
 *
 * Returns: { ok: true, updated: [keys] } on success.
 *          { ok: false, error: "..." } on validation failure (caller sends 400).
 */
export function setEnv(payload) {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'Body must be an object' };
  }

  // Normalize to batch shape
  let updates;
  if (Array.isArray(payload.updates)) {
    updates = payload.updates;
  } else if (typeof payload.key === 'string') {
    updates = [{ key: payload.key, value: payload.value }];
  } else {
    return { ok: false, error: 'Body must include {key, value} or {updates: [...]}' };
  }

  if (updates.length === 0) {
    return { ok: false, error: 'No updates provided' };
  }
  if (updates.length > 100) {
    return { ok: false, error: 'Too many updates (max 100 per request)' };
  }

  // Validate every update first — fail-fast before touching disk
  for (const u of updates) {
    if (!u || typeof u !== 'object') {
      return { ok: false, error: 'Each update must be {key, value}' };
    }
    const keyErr = validateKey(u.key);
    if (keyErr) return { ok: false, error: `${u.key}: ${keyErr}` };
    const valErr = validateValue(u.value);
    if (valErr) return { ok: false, error: `${u.key}: ${valErr}` };
  }

  if (!existsSync(ENV_PATH)) {
    return { ok: false, error: '.env does not exist. Run: node scripts/setup-env.js' };
  }

  const content = readFileSync(ENV_PATH, 'utf-8');
  const parsed = parseEnv(content);

  // Apply updates — reject if any key doesn't exist
  for (const u of updates) {
    const entry = parsed.byKey.get(u.key);
    if (!entry) {
      return {
        ok: false,
        error: `${u.key}: not found in .env. Add it via .env.example + setup-env.js, or via a skill's secrets_required.`,
      };
    }
    entry.value = u.value;
  }

  // Backup current state, then atomic write
  copyFileSync(ENV_PATH, ENV_BAK_PATH);
  const rendered = renderEnv(parsed.entries);
  // Preserve trailing newline if original had one
  const needsTrailingNewline = content.endsWith('\n') && !rendered.endsWith('\n');
  writeFileSync(ENV_TMP_PATH, rendered + (needsTrailingNewline ? '\n' : ''), {
    encoding: 'utf-8',
    mode: 0o600,
  });
  renameSync(ENV_TMP_PATH, ENV_PATH);

  return { ok: true, updated: updates.map(u => u.key) };
}

/**
 * GET /api/settings/mcp — read .mcp.json
 */
export function getMcp() {
  const mcpPath = join(workspaceRoot, '.mcp.json');
  if (!existsSync(mcpPath)) return {};
  try {
    return JSON.parse(readFileSync(mcpPath, 'utf-8'));
  } catch {
    return {};
  }
}

const SHELL_DANGEROUS = /[\$`\(\)\{\};\|&<>!\\]/;
const MCP_CMD_SAFE = /^[a-zA-Z0-9_./\\:-]+$/;
function isSafeArgString(s) {
  return typeof s === 'string' && !SHELL_DANGEROUS.test(s);
}
function validateMcpServer(entry, name) {
  if (!entry || typeof entry !== 'object') return `${name}: not an object`;

  if (entry.type === 'sse' || entry.type === 'http') {
    if (typeof entry.url !== 'string') return `${name}: missing url`;
    if (!/^https:\/\//i.test(entry.url)) return `${name}: only https:// urls allowed`;
    return null;
  }

  if (entry.command !== undefined) {
    if (typeof entry.command !== 'string' || !entry.command) return `${name}: command must be non-empty string`;
    if (!MCP_CMD_SAFE.test(entry.command)) return `${name}: command contains unsafe characters`;
    if (entry.command.includes('..')) return `${name}: command may not contain ..`;
  }
  if (entry.args !== undefined) {
    if (!Array.isArray(entry.args)) return `${name}: args must be array`;
    for (let i = 0; i < entry.args.length; i++) {
      if (!isSafeArgString(entry.args[i])) return `${name}: args[${i}] contains shell-dangerous characters`;
    }
  }
  if (entry.env !== undefined) {
    if (typeof entry.env !== 'object' || Array.isArray(entry.env)) return `${name}: env must be object`;
    for (const [k, v] of Object.entries(entry.env)) {
      if (typeof v !== 'string') return `${name}: env.${k} must be string`;
      if (SHELL_DANGEROUS.test(v)) return `${name}: env.${k} contains shell-dangerous characters`;
    }
  }
  return null;
}

/**
 * PUT /api/settings/mcp — write .mcp.json
 */
export function setMcp(config) {
  if (!config || typeof config !== 'object') return { ok: false, error: 'config must be object' };
  if (config.mcpServers !== undefined) {
    if (typeof config.mcpServers !== 'object' || Array.isArray(config.mcpServers)) {
      return { ok: false, error: 'mcpServers must be object' };
    }
    for (const [name, entry] of Object.entries(config.mcpServers)) {
      if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
        return { ok: false, error: `mcpServers.${name}: name must match [a-zA-Z0-9_-]+` };
      }
      const err = validateMcpServer(entry, `mcpServers.${name}`);
      if (err) return { ok: false, error: err };
    }
  }

  const mcpPath = join(workspaceRoot, '.mcp.json');
  writeFileSync(mcpPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  return { ok: true };
}
