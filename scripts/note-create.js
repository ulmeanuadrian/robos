#!/usr/bin/env node
/**
 * note-create.js
 *
 * Deterministic helper used by the sys-capture-note skill (and the
 * candidate-promotion flow) to create a new atomic note on disk.
 *
 * Generates a stable id, slugifies the title for the filename, writes
 * frontmatter + body, then runs the indexer for that one file so the
 * note is immediately searchable.
 *
 * The model never has to assemble paths or ids — that logic lives here,
 * one place, testable.
 *
 * CLI:
 *   node scripts/note-create.js --title "..." --body "..." [--tags "a,b,c"] [--source path]
 *
 * Reads body from --body OR stdin (preferred for long content).
 * Source defaults to "manual" — set to "candidate" when promoting a candidate.
 *
 * Stdout: JSON {id, path, title, indexed}
 */

import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { randomBytes } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROBOS_ROOT = join(__dirname, '..');
const NOTES_ROOT = join(ROBOS_ROOT, 'context', 'notes');

function parseArgs(argv) {
  const opts = { title: '', body: null, tags: [], origin: 'manual', candidateId: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--title') opts.title = argv[++i] || '';
    else if (a === '--body') opts.body = argv[++i] || '';
    else if (a === '--tags') opts.tags = (argv[++i] || '').split(',').map(t => t.trim()).filter(Boolean);
    else if (a === '--origin') opts.origin = argv[++i] || 'manual';
    else if (a === '--candidate-id') opts.candidateId = argv[++i] || null;
  }
  return opts;
}

function slugify(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'untitled';
}

function pad(n) { return String(n).padStart(2, '0'); }

function buildId(now) {
  const y = now.getFullYear();
  const m = pad(now.getMonth() + 1);
  const d = pad(now.getDate());
  const hh = pad(now.getHours());
  const mm = pad(now.getMinutes());
  const suffix = randomBytes(2).toString('hex'); // 4 hex chars
  return `note-${y}-${m}-${d}-${hh}${mm}-${suffix}`;
}

function ensureDir(d) { if (!existsSync(d)) mkdirSync(d, { recursive: true }); }

function readBodyFromStdin() {
  try { return readFileSync(0, 'utf-8'); } catch { return ''; }
}

function escapeYamlScalar(s) {
  // Conservative: if it contains : # [ ] { } & * ! | > ' " % @ ` newline, quote.
  if (!s) return '""';
  if (/[:#\[\]{}&*!|>'"%@`\n]/.test(s)) {
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return s;
}

function buildFrontmatter({ id, title, tags, origin, candidateId }) {
  const lines = ['---'];
  lines.push(`id: ${id}`);
  lines.push(`title: ${escapeYamlScalar(title)}`);
  lines.push(`created: ${new Date().toISOString()}`);
  lines.push(`origin: ${origin}`);
  if (candidateId) lines.push(`from_candidate: ${candidateId}`);
  if (tags.length) {
    lines.push('tags:');
    for (const t of tags) lines.push(`  - ${escapeYamlScalar(t)}`);
  } else {
    lines.push('tags: []');
  }
  lines.push('---');
  return lines.join('\n');
}

function main() {
  const opts = parseArgs(process.argv);

  let body = opts.body;
  if (body == null) body = readBodyFromStdin();
  body = (body || '').replace(/\r\n/g, '\n').trim();

  if (!opts.title.trim()) {
    process.stderr.write('Error: --title is required\n');
    process.exit(2);
  }

  const now = new Date();
  const id = buildId(now);
  const y = now.getFullYear();
  const m = pad(now.getMonth() + 1);
  const slug = slugify(opts.title);
  const filename = `${id}-${slug}.md`;

  const targetDir = join(NOTES_ROOT, String(y), m);
  ensureDir(targetDir);
  const absPath = join(targetDir, filename);
  const relPath = `context/notes/${y}/${m}/${filename}`;

  if (existsSync(absPath)) {
    // Extremely unlikely (4 hex of randomness in same minute), but be safe.
    process.stderr.write(`Error: file already exists: ${relPath}\n`);
    process.exit(1);
  }

  const content = buildFrontmatter({ id, title: opts.title, tags: opts.tags, origin: opts.origin, candidateId: opts.candidateId })
    + '\n\n# ' + opts.title + '\n\n' + body + '\n';

  writeFileSync(absPath, content, 'utf-8');

  // Index it immediately so the note is searchable on the next query.
  const indexer = spawnSync(process.execPath, [
    join(ROBOS_ROOT, 'scripts', 'notes-index.js'),
    '--file', relPath,
  ], { encoding: 'utf-8' });

  const indexed = indexer.status === 0;
  if (!indexed) {
    process.stderr.write(`[note-create] indexer non-zero exit: ${indexer.stderr || ''}\n`);
  }

  process.stdout.write(JSON.stringify({
    id,
    path: relPath,
    title: opts.title,
    tags: opts.tags,
    indexed,
  }) + '\n');
  process.exit(0);
}

main();
