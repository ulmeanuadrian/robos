// Parse and render .env files while preserving comments, section banners, and
// ordering. Single canonical implementation — used by setup-env.js, the
// dashboard env API, and any hook that needs to inspect/mutate env state.
//
// Format model: each line is one of three kinds:
//   - "comment"     → starts with `#` (or empty line); preserved verbatim
//   - "assignment"  → matches /^[A-Z_][A-Z0-9_]*\s*=/; key=value
//   - "raw"         → anything else (preserved verbatim, treated as comment)
//
// We do NOT support multi-line values, quoted values, or shell substitutions.
// This is intentional: robOS .env entries are flat key=value with comments above.

import { readFileSync } from 'fs';

const ASSIGN_RE = /^([A-Z_][A-Z0-9_]*)\s*=(.*)$/;

/**
 * Parse a .env file content into an ordered list of entries.
 * Returns: { entries: [{ kind, key?, value?, line }], byKey: Map<key, entry> }
 */
export function parseEnv(content) {
  const lines = content.split(/\r?\n/);
  const entries = [];
  const byKey = new Map();

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (trimmed === '' || trimmed.startsWith('#')) {
      entries.push({ kind: 'comment', line: raw });
      continue;
    }
    const m = raw.match(ASSIGN_RE);
    if (m) {
      const entry = { kind: 'assignment', key: m[1], value: m[2], line: raw };
      entries.push(entry);
      byKey.set(m[1], entry);
    } else {
      entries.push({ kind: 'raw', line: raw });
    }
  }
  return { entries, byKey };
}

export function parseEnvFile(path) {
  return parseEnv(readFileSync(path, 'utf-8'));
}

/**
 * Render entries back to a string. Uses entry.line verbatim for comment/raw,
 * and `${key}=${value}` for assignment entries (so updated values stay clean).
 * Trailing newline preserved if present in source.
 */
export function renderEnv(entries) {
  return entries
    .map(e => (e.kind === 'assignment' ? `${e.key}=${e.value}` : e.line))
    .join('\n');
}

/**
 * Diff two parsed env structures by keys.
 * Returns: { onlyInA: [keys], onlyInB: [keys], inBoth: [keys] }
 */
export function diffKeys(a, b) {
  const onlyInA = [];
  const onlyInB = [];
  const inBoth = [];
  for (const key of a.byKey.keys()) {
    if (b.byKey.has(key)) inBoth.push(key);
    else onlyInA.push(key);
  }
  for (const key of b.byKey.keys()) {
    if (!a.byKey.has(key)) onlyInB.push(key);
  }
  return { onlyInA, onlyInB, inBoth };
}

/**
 * Validate that a value is safe to write to a .env file.
 * Rejects newlines and characters that would break naive shell parsing.
 * Returns null if OK, or an error message.
 */
export function validateValue(value) {
  if (typeof value !== 'string') return 'value must be string';
  if (value.length > 8192) return 'value too long (max 8192 chars)';
  if (/[\r\n]/.test(value)) return 'value contains newline';
  if (/\0/.test(value)) return 'value contains null byte';
  return null;
}

/**
 * Validate that a key name is well-formed.
 */
export function validateKey(key) {
  if (typeof key !== 'string') return 'key must be string';
  if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) return 'key must be UPPER_SNAKE_CASE';
  if (key.length > 128) return 'key too long (max 128 chars)';
  return null;
}

/**
 * Status of a value. Used by dashboard for badge color without leaking content.
 */
export function valueStatus(value) {
  if (value == null || value.trim() === '') return 'unset';
  if (/^(xxx|placeholder|TODO|REPLACE_ME|<.*>)$/i.test(value.trim())) return 'placeholder';
  return 'set';
}
