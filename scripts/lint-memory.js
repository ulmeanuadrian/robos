#!/usr/bin/env node
/**
 * lint-memory.js
 *
 * Validator pentru fisierele de memorie (context/memory/YYYY-MM-DD.md).
 * Verifica structura obligatorie:
 *  - Cel putin un header `## Session N`
 *  - Pentru fiecare Session: sectiunile ### Goal, ### Deliverables, ### Decisions, ### Open Threads
 *  - La sfarsitul ultimei sesiuni inchise: pattern "Session: N deliverables, M decisions"
 *
 * Folosire:
 *  node scripts/lint-memory.js                       # lint memoria de azi
 *  node scripts/lint-memory.js 2026-05-04            # lint o data specifica
 *  node scripts/lint-memory.js --all                 # lint toate
 *  node scripts/lint-memory.js --strict              # warnings devin erori (exit !=0)
 *
 * Apelat de:
 *  - sys-session-close (Step 4) — verifica memoria inainte de inchidere
 *  - manual (debugging)
 *  - eventual cron pentru audit zilnic
 *
 * Output: rezumat pe stdout + cod de exit (0 = clean, 1 = errors, 2 = internal error).
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { isClosed, REQUIRED_SECTIONS } from './lib/memory-format.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROBOS_ROOT = join(__dirname, '..');
const MEMORY_DIR = join(ROBOS_ROOT, 'context', 'memory');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { date: null, all: false, strict: false };
  for (const arg of args) {
    if (arg === '--all') opts.all = true;
    else if (arg === '--strict') opts.strict = true;
    else if (/^\d{4}-\d{2}-\d{2}$/.test(arg)) opts.date = arg;
  }
  if (!opts.date && !opts.all) {
    opts.date = new Date().toISOString().slice(0, 10);
  }
  return opts;
}

/**
 * Analizeaza un fisier. Returneaza { errors: [], warnings: [], info: {} }.
 */
function lintFile(path) {
  const filename = path.split(/[\\/]/).pop();
  const result = { file: filename, errors: [], warnings: [], info: {} };

  if (!existsSync(path)) {
    result.errors.push(`File does not exist: ${path}`);
    return result;
  }

  const content = readFileSync(path, 'utf-8');
  result.info.bytes = content.length;

  // Verifica session headers
  const sessionMatches = [...content.matchAll(/^##\s+Session\s+(\d+)/gm)];
  result.info.sessionCount = sessionMatches.length;

  if (sessionMatches.length === 0) {
    result.errors.push('No `## Session N` header found');
  }

  // Pentru fiecare Session, verifica sectiunile obligatorii
  const sessionBlocks = splitBySession(content);
  for (let i = 0; i < sessionBlocks.length; i++) {
    const block = sessionBlocks[i];
    const sessionNum = block.number;
    for (const section of REQUIRED_SECTIONS) {
      const re = new RegExp(`^###\\s+${section}\\b`, 'mi');
      if (!re.test(block.body)) {
        result.errors.push(`Session ${sessionNum}: missing \`### ${section}\` section`);
      }
    }
  }

  // Verifica pattern de inchidere (doar warning daca lipseste — sesiunea poate fi in curs)
  result.info.hasClosingPattern = isClosed(content);
  if (!result.info.hasClosingPattern) {
    result.warnings.push('No closing pattern "Session: N deliverables, M decisions" — session may be in progress or improperly closed');
  }

  // Verifica daca toate sesiunile au open threads neterminate (warning)
  const lastBlock = sessionBlocks[sessionBlocks.length - 1];
  if (lastBlock) {
    const threadMatch = lastBlock.body.match(/###\s+Open\s+Threads\s*\n([\s\S]*?)(?=\n###|\n##|$)/i);
    if (threadMatch) {
      const threads = threadMatch[1]
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.startsWith('-') || l.startsWith('*'));
      result.info.openThreadCount = threads.length;
    } else {
      result.info.openThreadCount = 0;
    }
  }

  return result;
}

function splitBySession(content) {
  const blocks = [];
  const re = /^##\s+Session\s+(\d+)/gm;
  const matches = [...content.matchAll(re)];

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : content.length;
    blocks.push({
      number: parseInt(matches[i][1], 10),
      body: content.slice(start, end),
    });
  }

  return blocks;
}

async function main() {
  const opts = parseArgs();
  const targets = [];

  if (opts.all) {
    if (!existsSync(MEMORY_DIR)) {
      console.error(`[lint-memory] memory dir nu exista: ${MEMORY_DIR}`);
      process.exit(2);
    }
    const files = readdirSync(MEMORY_DIR)
      .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .sort();
    for (const f of files) targets.push(join(MEMORY_DIR, f));
  } else {
    targets.push(join(MEMORY_DIR, `${opts.date}.md`));
  }

  let totalErrors = 0;
  let totalWarnings = 0;

  for (const path of targets) {
    const result = lintFile(path);

    const status = result.errors.length > 0 ? 'FAIL' : (result.warnings.length > 0 ? 'WARN' : 'OK');
    console.log(`\n[${status}] ${result.file}`);
    console.log(`  Sessions: ${result.info.sessionCount || 0}, Bytes: ${result.info.bytes || 0}, Closed: ${result.info.hasClosingPattern ? 'yes' : 'no'}, Open threads: ${result.info.openThreadCount ?? '?'}`);

    for (const e of result.errors) {
      console.log(`  ERROR: ${e}`);
      totalErrors++;
    }
    for (const w of result.warnings) {
      console.log(`  WARN:  ${w}`);
      totalWarnings++;
    }
  }

  console.log(`\nSumar: ${targets.length} fisier(e), ${totalErrors} error(i), ${totalWarnings} warning(uri)`);

  if (totalErrors > 0) process.exit(1);
  if (opts.strict && totalWarnings > 0) process.exit(1);
  process.exit(0);
}

main().catch(e => {
  console.error(`[lint-memory] eroare: ${e.message}`);
  process.exit(2);
});
