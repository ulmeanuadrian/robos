#!/usr/bin/env node
/**
 * lint-security.js — Detect insecure secret comparisons (SEC-1) and a few
 * adjacent footguns. Style-aligned with lint-portability.js.
 *
 * Rules:
 *   - secret-strict-equals (BLOCK):
 *       Any of (token|secret|password|jwt|hmac|signature|apikey|api_key)
 *       compared with === or !== to another VARIABLE (not a literal).
 *       Comparing tokens with === leaks length and prefix-match through timing.
 *       Use crypto.timingSafeEqual or, on Cloudflare Workers, a constant-time
 *       compare implemented manually.
 *
 *   - hardcoded-secret-hex (WARN):
 *       Long hex string (>= 32 chars) appearing literal in code (heuristic).
 *       Common pattern for accidentally embedded secrets.
 *
 * Exemptions per line (any of):
 *   - `// lint-allow:secret-compare` or `// lint-allow:hardcoded-secret`
 *   - `typeof X === 'string'` (type check, not content compare)
 *   - `=== null` / `!== null` / `=== undefined` / `!== undefined`
 *   - `=== ''` / `=== ""` / `!== ''` / `!== ""`
 *   - `.length === N` / `.length !== N`
 *
 * Exemption per file:
 *   - lint-security.js itself (self-references in regex/docs)
 *   - smoke-*.js test fixtures (constant tokens used in test setup)
 *
 * Output: file:line + severity per finding.
 * Exit: 0 if no BLOCK; 1 if any BLOCK.
 *
 * Usage:
 *   node scripts/lint-security.js
 *   node scripts/lint-security.js --warn-as-error
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, extname, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROBOS_ROOT = dirname(dirname(__filename));

const WARN_AS_ERROR = process.argv.includes('--warn-as-error');

// Top-level dirs only — walkDir recurses, so listing both `licensing/src` and
// `licensing/src/endpoints` would scan endpoints/ twice (and double-report).
const SCAN_DIRS = [
  'scripts',
  join('centre', 'lib'),
  join('centre', 'api'),
  join('centre', 'src', 'lib'),
  join('licensing', 'src'),
];

const SKIP_DIRS = new Set(['node_modules', '_archive', '.archive', 'dist', 'build']);
// Per-file skip: this lint itself + smoke tests with deliberate constant tokens.
const SKIP_FILES = new Set(['lint-security.js']);
const SKIP_FILE_PATTERNS = [/^smoke-.*\.js$/];

// --- Rule 1: insecure secret strict-equals --------------------------------
//
// Pattern matches:  <secret-keyword>(\w*)?  \s*  [!=]==(?!=)  \s*  <RHS>
//
// We capture RHS to decide whether to exempt. RHS is one "token" (word, dot,
// quoted literal, or the few keywords we exempt). If RHS is a bare identifier
// and not a known-safe keyword, we flag.

const SECRET_KEYWORDS = ['token', 'secret', 'password', 'jwt', 'hmac', 'signature', 'apikey', 'api_key', 'apiKey'];
// Negative lookbehind for `typeof ` to avoid matching `typeof token === 'string'`.
// JS regex doesn't support variable-width lookbehind universally, so we use
// a line-level exemption below (typeof_check) instead of inline lookbehind.
const SECRET_PATTERN = new RegExp(
  `\\b(${SECRET_KEYWORDS.join('|')})\\w*\\s*([!=])==(?!=)\\s*([A-Za-z_$][\\w$]*|null|undefined|''|""|\\d+|true|false|'[^']*'|"[^"]*")`, // lint-allow:backslash (regex pattern in template literal)
  'i'
);

const SAFE_RHS = new Set(['null', 'undefined', "''", '""', 'true', 'false']);
function isSafeRhs(rhs) {
  if (SAFE_RHS.has(rhs)) return true;
  if (/^\d+$/.test(rhs)) return true;            // numeric literal
  if (/^['"][^'"]*['"]$/.test(rhs)) return true; // string literal
  return false;
}

// --- Rule 2: hardcoded long hex ------------------------------------------
//
// Heuristic: a quoted string of >=32 hex chars (a-f, 0-9) embedded in code.
// Excluded: lines marked `// lint-allow:hardcoded-secret`, lines that look
// like example IDs (UUID v4), and known constants exported as PUBLIC_* / TEST_*.

const HARDCODED_HEX = /['"`][a-fA-F0-9]{32,}['"`]/;
const KNOWN_PUBLIC_PREFIXES = /\b(PUBLIC_KEY|TEST_|EXAMPLE_|FIXTURE_)/;
const UUID_V4 = /^['"`][0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}['"`]$/i;

// --- Walk files ----------------------------------------------------------

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
    if (entry.isDirectory()) {
      walkDir(path, results);
    } else if (entry.isFile() && isSourceFile(entry.name)) {
      const name = basename(path);
      if (SKIP_FILES.has(name)) continue;
      if (SKIP_FILE_PATTERNS.some(re => re.test(name))) continue;
      results.push(path);
    }
  }
  return results;
}

/**
 * Lint a content string. Pure function — used by lintFile and exported for
 * fixture-based tests in smoke-lint-security-rules.js.
 *
 * @param {string} content  source text
 * @param {string} [fileLabel='<inline>']  shown in finding.file (cosmetic)
 * @returns {Array<{file, line, rule, severity, message, source}>}
 */
export function lintContent(content, fileLabel = '<inline>') {
  const findings = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isComment = /^\s*(\/\/|\*|\/\*)/.test(line);

    // Rule 1: secret-strict-equals
    if (!isComment && !line.includes('// lint-allow:secret-compare')) {
      const isTypeofCheck = /\btypeof\s+\w+\s*[!=]==/.test(line);
      if (!isTypeofCheck) {
        const m = SECRET_PATTERN.exec(line);
        if (m) {
          const rhs = m[3];
          if (!isSafeRhs(rhs)) {
            findings.push({
              file: fileLabel,
              line: i + 1,
              rule: 'secret-strict-equals',
              severity: 'BLOCK',
              message: 'Compare secrets with crypto.timingSafeEqual (or constant-time compare on Workers), not === / !==',
              source: line.trim().slice(0, 100),
            });
          }
        }
      }
    }

    // Rule 2: hardcoded hex secret
    if (!isComment && !line.includes('// lint-allow:hardcoded-secret')) {
      if (HARDCODED_HEX.test(line) && !KNOWN_PUBLIC_PREFIXES.test(line)) {
        const allUuid = (line.match(/['"`][^'"]+['"`]/g) || []).every(s => UUID_V4.test(s) || !HARDCODED_HEX.test(s));
        if (!allUuid) {
          findings.push({
            file: fileLabel,
            line: i + 1,
            rule: 'hardcoded-secret-hex',
            severity: 'WARN',
            message: 'Long hex string in source — confirm it is not a private key / token. Move secrets to .env.',
            source: line.trim().slice(0, 100),
          });
        }
      }
    }
  }
  return findings;
}

export function lintFile(path) {
  let content;
  try { content = readFileSync(path, 'utf8'); }
  catch { return []; }
  const fileLabel = relative(ROBOS_ROOT, path).replace(/\\/g, '/');
  return lintContent(content, fileLabel);
}

// --- Main ----------------------------------------------------------------

function main() {
  const files = [];
  for (const dir of SCAN_DIRS) {
    walkDir(join(ROBOS_ROOT, dir), files);
  }

  console.log(`Scanning ${files.length} file(s) for security issues...\n`);

  let blockCount = 0;
  let warnCount = 0;
  let totalFiles = 0;

  for (const path of files) {
    const findings = lintFile(path);
    if (findings.length === 0) continue;
    totalFiles++;

    for (const f of findings) {
      const sev = WARN_AS_ERROR && f.severity === 'WARN' ? 'BLOCK' : f.severity;
      if (sev === 'BLOCK') blockCount++;
      else warnCount++;
      console.log(`[${sev}] ${f.file}:${f.line} (${f.rule})`);
      console.log(`  ${f.message}`);
      console.log(`  > ${f.source}`);
      console.log('');
    }
  }

  console.log('='.repeat(60));
  console.log(`${files.length} files scanned, ${totalFiles} with issues`);
  console.log(`  BLOCK: ${blockCount}`);
  console.log(`  WARN:  ${warnCount}`);
  console.log('='.repeat(60));

  process.exit(blockCount > 0 ? 1 : 0);
}

// Run main() only when invoked directly (so smoke tests can import lintContent
// without firing the full scan + process.exit).
const __invokedFile = process.argv[1] && process.argv[1].replace(/\\/g, '/');
const __thisFile = fileURLToPath(import.meta.url).replace(/\\/g, '/');
if (__invokedFile === __thisFile) {
  main();
}
