#!/usr/bin/env node
/**
 * lint-claims.js
 *
 * Pre-flight check pentru fisiere markdown: scaneaza orice path-like reference
 * (`folder/file.ext`, `scripts/x.sh`, `[text](path/file.md)`) si verifica daca
 * exista in repo. Hallucination guard pentru docs / LP / copy.
 *
 * Folosire:
 *   node scripts/lint-claims.js docs/claude-vs-robos.md
 *   node scripts/lint-claims.js projects/content-landing-page/robos-lp.md
 *   node scripts/lint-claims.js docs/claude-vs-robos.md README.md
 *   node scripts/lint-claims.js --verbose docs/claude-vs-robos.md
 *
 * Exit codes:
 *   0 — toate path-urile gasite verificate (sau toate sunt placeholder/illustrative)
 *   1 — cel putin un path mentionat NU exista in repo
 *   2 — eroare de utilizare
 *
 * Output:
 *   ✓ Scanned: {file}
 *     - N path-like references
 *     - V verified to exist
 *     - P placeholders (skipped — contain {} or <>)
 *     - U URL-like (skipped)
 *     - M missing
 *   Lista MISSING cu file:line (sau, in --verbose, lista completa cu status fiecare).
 */

import { readFileSync, existsSync, statSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROBOS_ROOT = resolve(join(__dirname, '..'));

// Path-like regex: prefix from a known top-level dir, followed by /, followed by valid path chars.
// Ancored to avoid prose words. Word boundary at start.
const KNOWN_DIRS = ['scripts', 'context', 'data', 'brand', 'clients', 'projects', 'skills', 'docs', 'tests', 'centre', 'cron'];
const KNOWN_DIRS_PATTERN = KNOWN_DIRS.join('|');

// Match patterns:
//   1. Inline code with path:    `data/foo.json`  or  `scripts/x.sh`
//   2. Markdown links to paths:  [text](path/to/file)
//   3. Bare paths after whitespace/punctuation: `data/foo.json` standalone
const PATH_REGEX = new RegExp(
  '(?:`([^`]+)`)' +                                                              // inline code
  '|' +
  '(?:\\]\\(([^)]+)\\))' +                                                        // markdown link
  '|' +
  `(?:(?:^|[\\s\\(\\["'])(${KNOWN_DIRS_PATTERN})/([\\w./_-]+))`,                // bare path
  'g'
);

function isPlaceholder(p) {
  // Curly/angle braces, glob wildcards, and date-format templates are templates, not real paths.
  if (/[{}<>*]/.test(p)) return true;
  if (/YYYY[\s\-]?MM[\s\-]?DD/i.test(p)) return true;
  if (/\bMM-DD\b/i.test(p)) return true;
  return false;
}

function isUrl(p) {
  return /^https?:\/\//i.test(p);
}

function isAnchor(p) {
  return p.startsWith('#');
}

function isMailto(p) {
  return /^mailto:/i.test(p);
}

function looksLikePath(p) {
  // Has slash or extension, AND is not a sentence fragment.
  if (!p) return false;
  if (p.length > 200) return false;
  // Strip common trailing punctuation.
  const stripped = p.replace(/[.,;:!?]+$/, '');
  if (!stripped.includes('/') && !/\.[a-z0-9]{1,8}$/i.test(stripped)) return false;
  // Must start with a known dir or have a path-ish structure.
  const firstSegment = stripped.split('/')[0];
  if (KNOWN_DIRS.includes(firstSegment)) return true;
  // Anchored relative paths
  if (stripped.startsWith('./') || stripped.startsWith('../')) return true;
  // Filename with extension at root (rare in our docs)
  if (!stripped.includes('/') && /\.[a-z0-9]{1,8}$/i.test(stripped)) {
    // Accept only if it's a known root-level file
    const rootFiles = ['README.md', 'AGENTS.md', 'CLAUDE.md', 'CHANGELOG.md', 'VERSION', '.env', '.env.example', '.gitignore', 'package.json'];
    return rootFiles.includes(stripped);
  }
  return false;
}

function stripTrailingPunct(p) {
  return p.replace(/[.,;:!?\)]+$/, '');
}

function extractAnchor(p) {
  // Returns [path, anchor] — anchor stripped because we only check file existence
  const idx = p.indexOf('#');
  if (idx === -1) return [p, null];
  return [p.slice(0, idx), p.slice(idx + 1)];
}

function stripLineRef(p) {
  // Strip ":N" or ":N-M" line refs (e.g., "context/audits/x.md:224") before checking existence.
  return p.replace(/:\d+(-\d+)?$/, '');
}

function checkPath(p) {
  let [pathOnly] = extractAnchor(p);
  pathOnly = stripLineRef(pathOnly);
  if (!pathOnly) return 'invalid';
  const absolute = resolve(ROBOS_ROOT, pathOnly);
  // Make sure we don't escape repo root.
  if (!absolute.startsWith(ROBOS_ROOT)) return 'invalid';
  return existsSync(absolute) ? 'verified' : 'missing';
}

function lintFile(file) {
  const absFile = resolve(file);
  if (!existsSync(absFile)) {
    return { file, error: `nu exista: ${file}` };
  }

  const content = readFileSync(absFile, 'utf-8');
  const lines = content.split('\n');

  const findings = []; // { line, raw, type, status }

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    let m;
    const re = new RegExp(PATH_REGEX.source, 'g');
    while ((m = re.exec(line)) !== null) {
      const inlineCode = m[1];
      const mdLink = m[2];
      const bareDir = m[3];
      const bareRest = m[4];

      let candidate = null;
      if (inlineCode) candidate = inlineCode.trim();
      else if (mdLink) candidate = mdLink.trim();
      else if (bareDir && bareRest) candidate = `${bareDir}/${bareRest}`;

      if (!candidate) continue;
      if (isUrl(candidate) || isAnchor(candidate) || isMailto(candidate)) continue;

      const stripped = stripTrailingPunct(candidate);
      if (!looksLikePath(stripped)) continue;
      if (isPlaceholder(stripped)) {
        findings.push({ line: lineIdx + 1, raw: stripped, status: 'placeholder' });
        continue;
      }

      const status = checkPath(stripped);
      findings.push({ line: lineIdx + 1, raw: stripped, status });
    }
  }

  return { file, findings };
}

function summarize(results, verbose) {
  let total = 0;
  let verified = 0;
  let missing = 0;
  let placeholder = 0;
  const missingList = [];
  const verboseList = [];

  for (const r of results) {
    if (r.error) {
      console.error(`✗ ${r.file}: ${r.error}`);
      continue;
    }
    console.log(`Scanned: ${r.file}`);
    let fileVerified = 0, fileMissing = 0, filePlaceholder = 0;
    for (const f of r.findings) {
      total++;
      if (f.status === 'verified') { verified++; fileVerified++; }
      else if (f.status === 'missing') { missing++; fileMissing++; missingList.push({ ...f, file: r.file }); }
      else if (f.status === 'placeholder') { placeholder++; filePlaceholder++; }
      if (verbose) verboseList.push({ ...f, file: r.file });
    }
    console.log(`  - ${r.findings.length} path-like references`);
    console.log(`  - ${fileVerified} verified`);
    if (filePlaceholder) console.log(`  - ${filePlaceholder} placeholders (skipped)`);
    if (fileMissing) console.log(`  - ${fileMissing} MISSING`);
  }

  if (verbose && verboseList.length) {
    console.log('\n--- VERBOSE: all references ---');
    for (const v of verboseList) {
      const marker = v.status === 'verified' ? '✓' : v.status === 'missing' ? '✗' : '~';
      console.log(`  ${marker} [${v.status}] ${v.file}:${v.line} → ${v.raw}`);
    }
  }

  if (missingList.length) {
    console.log('\n--- MISSING ---');
    for (const m of missingList) {
      console.log(`  ${m.file}:${m.line} → ${m.raw}`);
    }
  }

  console.log(`\nTotal: ${total} | Verified: ${verified} | Placeholder: ${placeholder} | Missing: ${missing}`);

  return missing === 0 ? 0 : 1;
}

function main() {
  const argv = process.argv.slice(2);
  let verbose = false;
  const files = [];
  for (const a of argv) {
    if (a === '--verbose' || a === '-v') verbose = true;
    else if (a === '--help' || a === '-h') {
      console.log('Usage: node scripts/lint-claims.js [--verbose] file1.md [file2.md ...]');
      console.log('Verifica path-uri mentionate in markdown ca exista in repo. Exit 1 daca lipsesc.');
      process.exit(0);
    }
    else files.push(a);
  }

  if (files.length === 0) {
    console.error('Eroare: niciun fisier dat. Vezi --help.');
    process.exit(2);
  }

  const results = files.map(lintFile);
  const exitCode = summarize(results, verbose);
  process.exit(exitCode);
}

main();
