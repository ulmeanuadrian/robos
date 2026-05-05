import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { workspaceRoot } from '../lib/config.js';

const SENSITIVE_PATTERNS = ['KEY', 'SECRET', 'TOKEN', 'PASSWORD', 'PASS', 'PRIVATE', 'CREDENTIAL', 'DSN', 'AUTH'];
const SHELL_DANGEROUS = /[\$`\(\)\{\};\|&<>!\\]/;

/**
 * GET /api/settings/env — read .env file with masked values
 */
export function getEnv() {
  const envPath = join(workspaceRoot, '.env');
  if (!existsSync(envPath)) return [];

  const content = readFileSync(envPath, 'utf-8');
  const lines = content.split('\n');
  const vars = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!match) continue;

    const key = match[1];
    const value = match[2].replace(/^["']|["']$/g, '');
    const isSensitive = SENSITIVE_PATTERNS.some(p => key.includes(p));

    vars.push({
      key,
      value: isSensitive ? maskValue(value) : value,
      masked: isSensitive,
    });
  }

  return vars;
}

function maskValue() {
  // Always return a constant mask. Earlier version leaked the first 3
  // characters which is enough to distinguish provider families
  // (sk-ant- vs sk-, fc-, AIza-, etc.) and reduces brute-force entropy.
  return '****';
}

/**
 * PUT /api/settings/env — write .env file
 */
export function setEnv(vars) {
  const envPath = join(workspaceRoot, '.env');

  // Read existing to preserve comments and unmasked values
  let existingVars = {};
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const match = line.trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (match) {
        existingVars[match[1]] = match[2].replace(/^["']|["']$/g, '');
      }
    }
  }

  const lines = [];
  for (const v of vars) {
    let value = v.masked && v.value.includes('****')
      ? existingVars[v.key] || v.value
      : v.value;

    // Reject shell-dangerous characters to prevent injection via source .env
    if (SHELL_DANGEROUS.test(value)) {
      value = existingVars[v.key] || '';
    }

    lines.push(`${v.key}=${value}`);
  }

  writeFileSync(envPath, lines.join('\n') + '\n', 'utf-8');
  return true;
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

/**
 * Validate one MCP server entry. Returns true if shape is safe.
 *
 * MCP servers run as subprocesses on next Claude session. An attacker
 * controlling this PUT (CSRF or LAN reach) could register
 * { command: "powershell", args: ["-c", "evil"] } and get RCE on
 * the operator's machine. We validate the shape strictly:
 *  - command (if present) must be a plain identifier or absolute path
 *    matching /^[a-zA-Z0-9_./\\:-]+$/, no shell metacharacters
 *  - args must be array of strings, each without shell-dangerous chars
 *  - env must be object of string values, each safe
 *  - url (for sse/http servers) must be https:// only
 */
const MCP_CMD_SAFE = /^[a-zA-Z0-9_./\\:-]+$/;
function isSafeArgString(s) {
  return typeof s === 'string' && !SHELL_DANGEROUS.test(s);
}
function validateMcpServer(entry, name) {
  if (!entry || typeof entry !== 'object') return `${name}: not an object`;

  // HTTP / SSE servers
  if (entry.type === 'sse' || entry.type === 'http') {
    if (typeof entry.url !== 'string') return `${name}: missing url`;
    if (!/^https:\/\//i.test(entry.url)) return `${name}: only https:// urls allowed`;
    return null;
  }

  // Stdio (subprocess) servers
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
 *
 * Returns:
 *   { ok: true } on success
 *   { ok: false, error: '...' } on validation failure
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
