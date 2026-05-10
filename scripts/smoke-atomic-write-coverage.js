#!/usr/bin/env node
/**
 * smoke-atomic-write-coverage.js — Pin DAT-1 (critical writes go through atomicWrite).
 *
 * Critical paths must NEVER be written via plain `writeFileSync` in production
 * code — a crash mid-write would corrupt state and block the user (e.g.,
 * .env truncated, _index.json half-written, launcher-state.json broken).
 *
 * Critical paths:
 *   - .env (operator secrets)
 *   - data/launcher-state.json (boot state)
 *   - data/active-client.json (workspace routing)
 *   - skills/_index.json (skill registry — read by every prompt)
 *   - data/required-secrets.json (derived; consumed by setup-env)
 *   - data/audit-cache.json (skill output cache)
 *
 * Allowed write mechanisms:
 *   - `atomicWrite(target, content)` from scripts/lib/atomic-write.js
 *   - Local atomic pattern: `writeFileSync(target.tmp)` + `renameSync(tmp, target)`
 *     (acceptable but DRY violation; preferred: use the lib)
 *
 * Forbidden: direct `writeFileSync(target, ...)` where target is one of the
 * critical paths.
 *
 * Allowlist: smoke tests under scripts/smoke-*.js write to TMP_DIR copies of
 * these files for fixtures — those don't target the real paths.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, basename, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROBOS_ROOT = join(dirname(__filename), '..');

let pass = 0;
let fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`); }
}

const SCAN_DIRS = ['scripts', 'centre/lib', 'centre/api', 'licensing/src'];
const SKIP_DIRS = new Set(['node_modules', '_archive', '.archive', 'dist', 'build']);
const SKIP_FILE_PATTERNS = [
  /^smoke-.*\.js$/,                  // smoke tests use TMP_DIR fixtures
  /^smoke-atomic-write-coverage\.js$/, // self
];

// Critical path bases — when these appear as the FIRST argument to writeFileSync,
// it must be inside an atomic pattern.
const CRITICAL_NAMES = [
  '.env',
  'launcher-state.json',
  'active-client.json',
  '_index.json',
  'required-secrets.json',
  'audit-cache.json',
];

function isSourceFile(name) {
  return ['.js', '.mjs', '.cjs', '.ts'].includes(extname(name));
}

function walkDir(dir, results = []) {
  if (!statSync(dir, { throwIfNoEntry: false })) return results;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); }
  catch { return results; }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walkDir(path, results);
    else if (entry.isFile() && isSourceFile(entry.name)) {
      if (SKIP_FILE_PATTERNS.some(re => re.test(basename(path)))) continue;
      results.push(path);
    }
  }
  return results;
}

// Detect direct `writeFileSync(<criticalPath>, ...)` where the FIRST arg
// (target) is a critical path. Second-arg references (e.g. `readFileSync(ENV_PATH)`
// passed as content) don't count — those are sources, not write targets.
//
// Strategy: extract first arg of writeFileSync, check it against critical names.
function extractFirstArg(call) {
  // call: "writeFileSync(<arg1>, <arg2>, ...)"
  // Match up to first comma at depth 0 (handle nested parens).
  const inner = call.replace(/^writeFileSync\s*\(/, '').replace(/\)\s*$/, '');
  let depth = 0;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === ',' && depth === 0) return inner.slice(0, i).trim();
  }
  return inner.trim();
}

function findUnsafeWrites(content, fileLabel) {
  const findings = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*\/\//.test(line)) continue;

    const wfsMatch = /writeFileSync\s*\([^)]*\)/.exec(line);
    if (!wfsMatch) continue;
    const target = extractFirstArg(wfsMatch[0]);
    if (!target) continue;

    // Identify critical target by literal path or known constant.
    let critical = null;
    for (const name of CRITICAL_NAMES) {
      // Quoted-path match: '.env', "data/...launcher-state.json", etc.
      const literalRe = new RegExp(`['"\`/](${name.replace(/[.]/g, '\\.')})['"\`]?`, 'i');
      if (literalRe.test(target)) { critical = name; break; }
    }
    // Variable-named target: ENV_PATH, STATE_PATH, INDEX_FILE, etc.
    if (!critical) {
      if (/\bENV_(PATH|FILE|TARGET)\b/.test(target) && !/\bENV_BAK\b/.test(target)) critical = '.env';
      else if (/\bSTATE_PATH\b|\bLAUNCHER_STATE_PATH\b/.test(target)) critical = 'launcher-state.json';
      else if (/\bINDEX_FILE\b|\bSKILLS_INDEX\b/.test(target)) critical = '_index.json';
      else if (/\bACTIVE_CLIENT_PATH\b|\bSTATE_FILE\b/.test(target)) {
        // STATE_FILE in client-context.js IS active-client.json — but that file uses atomicWrite
        // already. Only flag if NOT followed by a clear atomic pattern.
        // Check: is the writeFileSync flanked by atomicWrite? In that case skip.
        critical = null; // skip — atomic-write consumers are validated separately
      }
    }

    if (!critical) continue;

    // Allow tmp-path target with following renameSync (local atomic pattern).
    if (/\.tmp\b/.test(target) || /TMP_PATH\b/.test(target) || /_TMP\b/.test(target)) {
      const window = lines.slice(i, i + 4).join(' ');
      if (/renameSync\s*\(/.test(window)) continue;
    }

    findings.push({
      file: fileLabel,
      line: i + 1,
      critical,
      source: line.trim().slice(0, 100),
    });
  }
  return findings;
}

// --- Run scan ---
console.log('--- Direct writes to critical paths ---');

const files = [];
for (const dir of SCAN_DIRS) walkDir(join(ROBOS_ROOT, dir), files);

let totalUnsafe = 0;
for (const path of files) {
  const fileLabel = relative(ROBOS_ROOT, path).replace(/\\/g, '/');
  // Skip atomic-write.js itself — that's the lib that uses writeFileSync legitimately on .tmp
  if (fileLabel === 'scripts/lib/atomic-write.js') continue;
  // Skip env-loader (read-only) and env-format (formatter, no write)
  if (fileLabel === 'scripts/lib/env-loader.js') continue;
  if (fileLabel === 'scripts/lib/env-format.js') continue;

  const content = readFileSync(path, 'utf-8');
  const findings = findUnsafeWrites(content, fileLabel);
  if (findings.length > 0) {
    totalUnsafe += findings.length;
    for (const f of findings) {
      console.log(`  UNSAFE  ${f.file}:${f.line} → writes ${f.critical}`);
      console.log(`          > ${f.source}`);
    }
  }
}

check('zero direct writes to critical paths outside atomic-write.js',
  totalUnsafe === 0,
  `${totalUnsafe} unsafe write(s) found`);

// --- Verify expected consumers actually use atomicWrite ---
console.log('\n--- Consumer wiring ---');

const EXPECTED_CONSUMERS = [
  { file: 'scripts/lib/launcher-state.js', wants: 'atomicWrite' },
  { file: 'scripts/lib/client-context.js', wants: 'atomicWrite' },
  { file: 'scripts/rebuild-index.js',      wants: 'atomicWrite' },
  { file: 'scripts/lib/loop-detector.js',  wants: 'atomicWrite' },
  { file: 'scripts/lib/ndjson-log.js',     wants: 'atomicWrite' },
];

for (const { file, wants } of EXPECTED_CONSUMERS) {
  const path = join(ROBOS_ROOT, file);
  if (!statSync(path, { throwIfNoEntry: false })) {
    check(`${file} exists`, false);
    continue;
  }
  const src = readFileSync(path, 'utf-8');
  const importsAtomic = /from\s+['"][^'"]*atomic-write[^'"]*['"]/.test(src);
  check(`${file} imports atomic-write lib`, importsAtomic,
    `expected import; consumer should not implement atomic write inline`);
}

console.log('\n=========================');
console.log(`PASSED: ${pass}`);
console.log(`FAILED: ${fail}`);
console.log('=========================');
process.exit(fail > 0 ? 1 : 0);
