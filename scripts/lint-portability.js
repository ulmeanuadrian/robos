#!/usr/bin/env node
// scripts/lint-portability.js — Detect shellisme cross-platform.
//
// Scaneaza fisiere .js in scripts/, centre/lib/, centre/api/, scripts/lib/
// pentru pattern-uri care vor fail pe Windows sau Mac.
//
// Output: lista findings cu file:line + severity (BLOCK|WARN).
// Exit code: 0 daca zero BLOCK; 1 daca exista BLOCK.
//
// Usage:
//   node scripts/lint-portability.js            # raporteaza
//   node scripts/lint-portability.js --warn-as-error  # WARN devine BLOCK

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROBOS_ROOT = dirname(dirname(__filename));

const WARN_AS_ERROR = process.argv.includes('--warn-as-error');

// Top-level dirs only — walkDir recurses, so listing both `scripts` and
// `scripts/lib` would scan lib/ twice (and double-report any finding).
const SCAN_DIRS = [
  'scripts',
  join('centre', 'lib'),
  join('centre', 'api'),
];

const SKIP_DIRS = new Set(['node_modules', '_archive', '.archive', 'dist']);
const SKIP_FILES = new Set(['lint-portability.js']); // self

// Rule: { id, severity: 'BLOCK'|'WARN', pattern: RegExp, message, exempt?: RegExp }
// Exempt skips a rule when matched on the same line (e.g. comments).
const RULES = [
  {
    id: 'env-home',
    severity: 'BLOCK',
    pattern: /process\.env\.HOME\b/,
    message: 'process.env.HOME nu exista pe Windows. Foloseste os.homedir().',
  },
  {
    id: 'env-userprofile',
    severity: 'BLOCK',
    pattern: /process\.env\.USERPROFILE\b/,
    message: 'process.env.USERPROFILE nu exista pe Mac. Foloseste os.homedir().',
  },
  {
    id: 'shell-true',
    severity: 'WARN',
    pattern: /\bshell:\s*true\b/,
    message: 'shell:true ruleaza prin cmd.exe pe Windows / sh pe Mac. Risc de injection. Prefera spawn cu argv array.',
    exempt: /\/\/.*lint-allow:shell-true/,
  },
  {
    id: 'exec-call',
    severity: 'WARN',
    pattern: /\bchild_process\.exec\(|require\(['"]child_process['"]\)\.exec\(|\bexec\s*\(\s*['"`]/,
    message: 'child_process.exec foloseste shell implicit. Prefera spawn cu argv array.',
    exempt: /\/\/.*lint-allow:exec/,
  },
  {
    id: 'backslash-path',
    severity: 'WARN',
    pattern: /['"`][^'"`\n]*\\\\[a-zA-Z][^'"`\n]*['"`]/,
    message: 'Backslash literal in path = Windows-only. Foloseste path.join.',
    exempt: /\/\/.*lint-allow:backslash|regex|RegExp|\\\\n|\\\\r|\\\\t|^\s*\*/,
  },
  {
    id: 'forward-slash-multi-segment',
    severity: 'WARN',
    pattern: /['"`][a-zA-Z_][\w-]*\/[a-zA-Z_][\w-]*\/[a-zA-Z_][\w-]+['"`]/,
    message: 'Path-uri multi-segment hardcoded — foloseste path.join pentru cross-platform safety.',
    exempt: /https?:\/\/|http:\/\/|file:\/\/|^\s*\*|\/\/.*lint-allow:slash|require\(|import |from |\.then\(/,
  },
];

function isJsFile(name) {
  return ['.js', '.mjs', '.cjs'].includes(extname(name));
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
    } else if (entry.isFile() && isJsFile(entry.name) && !SKIP_FILES.has(entry.name)) {
      results.push(path);
    }
  }
  return results;
}

function lintFile(path) {
  const findings = [];
  let content;
  try { content = readFileSync(path, 'utf8'); }
  catch { return findings; }

  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // skip pure-comment lines for most rules (less noise)
    const isComment = /^\s*(\/\/|\*|\/\*)/.test(line);

    for (const rule of RULES) {
      if (rule.exempt && rule.exempt.test(line)) continue;
      if (isComment && rule.id !== 'env-home' && rule.id !== 'env-userprofile') continue;
      if (rule.pattern.test(line)) {
        findings.push({
          file: relative(ROBOS_ROOT, path).replace(/\\/g, '/'),
          line: i + 1,
          rule: rule.id,
          severity: rule.severity,
          message: rule.message,
          source: line.trim().slice(0, 100),
        });
      }
    }
  }
  return findings;
}

function main() {
  const files = [];
  for (const dir of SCAN_DIRS) {
    walkDir(join(ROBOS_ROOT, dir), files);
  }

  console.log(`Scanning ${files.length} file(s) for portability issues...\n`);

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

main();
