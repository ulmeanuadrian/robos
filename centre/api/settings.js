import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { workspaceRoot } from '../lib/config.js';

const SENSITIVE_PATTERNS = ['KEY', 'SECRET', 'TOKEN', 'PASSWORD', 'PASS'];

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

function maskValue(val) {
  if (val.length <= 4) return '****';
  return val.slice(0, 3) + '***' + val.slice(-2);
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

  // Build new content, skip masked values that weren't changed
  const lines = [];
  for (const v of vars) {
    const value = v.masked && v.value.includes('***')
      ? existingVars[v.key] || v.value
      : v.value;
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
 * PUT /api/settings/mcp — write .mcp.json
 */
export function setMcp(config) {
  const mcpPath = join(workspaceRoot, '.mcp.json');
  writeFileSync(mcpPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  return true;
}
