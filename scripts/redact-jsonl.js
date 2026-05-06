#!/usr/bin/env node
/**
 * redact-jsonl.js
 *
 * Generic redactor: walks every JSON line in a .jsonl file and replaces
 * known credential shapes inside ANY string value (deep-recursive — handles
 * nested objects and arrays such as Claude Code transcripts).
 *
 * Use cases:
 *   - Claude Code session transcripts (~/.claude/projects/<proj>/<sess>.jsonl)
 *     where a credential was pasted in a turn.
 *   - Any other line-delimited JSON log.
 *
 * Safety:
 *   - Refuses to touch files modified in the last `--min-idle <sec>` seconds
 *     (default 60s). This guards against rewriting a transcript that another
 *     Claude Code instance is actively appending to. Override with
 *     `--force` only if you're sure no process is writing.
 *   - Atomic rewrite via .tmp + rename (NTFS / ext4 atomic).
 *   - Backup is OPT-IN (`--backup`); off by default because the goal of
 *     redaction is to scrub disk.
 *   - Idempotent: repeated runs on already-redacted content are a no-op.
 *
 * CLI:
 *   node scripts/redact-jsonl.js --file path/to.jsonl
 *   node scripts/redact-jsonl.js --file ... --dry-run
 *   node scripts/redact-jsonl.js --file ... --min-idle 300
 *   node scripts/redact-jsonl.js --file ... --force
 *   node scripts/redact-jsonl.js --file ... --backup
 */

import { readFileSync, writeFileSync, statSync, copyFileSync, renameSync, existsSync } from 'fs';
import { redactSensitive } from './lib/redact.js';

function parseArgs(argv) {
  const opts = { file: null, dryRun: false, backup: false, minIdle: 60, force: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--file') opts.file = argv[++i];
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--backup') opts.backup = true;
    else if (a === '--min-idle') opts.minIdle = parseInt(argv[++i], 10) || 60;
    else if (a === '--force') opts.force = true;
  }
  return opts;
}

/**
 * Recursively walk a JSON value, redacting strings via redactSensitive.
 * Returns { value, changed }. Does not mutate the input.
 */
function deepRedact(v) {
  if (typeof v === 'string') {
    const r = redactSensitive(v);
    return { value: r, changed: r !== v };
  }
  if (Array.isArray(v)) {
    let changed = false;
    const out = v.map((x) => {
      const { value, changed: c } = deepRedact(x);
      if (c) changed = true;
      return value;
    });
    return { value: out, changed };
  }
  if (v && typeof v === 'object') {
    let changed = false;
    const out = {};
    for (const k of Object.keys(v)) {
      const { value, changed: c } = deepRedact(v[k]);
      if (c) changed = true;
      out[k] = value;
    }
    return { value: out, changed };
  }
  return { value: v, changed: false };
}

function main() {
  const opts = parseArgs(process.argv);
  if (!opts.file) {
    process.stderr.write('Usage: redact-jsonl.js --file <path> [--dry-run] [--min-idle <sec>] [--force] [--backup]\n');
    process.exit(2);
  }
  if (!existsSync(opts.file)) {
    process.stderr.write(`File not found: ${opts.file}\n`);
    process.exit(1);
  }

  // Idle check: refuse if file was modified within minIdle seconds.
  if (!opts.force) {
    const st = statSync(opts.file);
    const ageSec = (Date.now() - st.mtimeMs) / 1000;
    if (ageSec < opts.minIdle) {
      process.stderr.write(JSON.stringify({
        error: 'file-too-fresh',
        message: `File mtime is ${ageSec.toFixed(1)}s ago (< min-idle ${opts.minIdle}s). Likely actively being written. Use --force only if you are sure.`,
        file: opts.file,
      }) + '\n');
      process.exit(3);
    }
  }

  const raw = readFileSync(opts.file, 'utf-8');
  const mtimeBefore = statSync(opts.file).mtimeMs;
  const lines = raw.split('\n');

  let totalLines = 0;
  let changedLines = 0;
  const outLines = [];

  for (const line of lines) {
    if (!line.trim()) { outLines.push(line); continue; }
    totalLines++;
    let obj;
    try { obj = JSON.parse(line); }
    catch {
      outLines.push(line); // preserve corrupt lines untouched
      continue;
    }
    const { value: redacted, changed } = deepRedact(obj);
    if (changed) changedLines++;
    outLines.push(JSON.stringify(redacted));
  }

  if (opts.dryRun) {
    process.stdout.write(JSON.stringify({ mode: 'dry-run', totalLines, changedLines, file: opts.file }) + '\n');
    process.exit(0);
  }

  if (changedLines === 0) {
    process.stdout.write(JSON.stringify({ mode: 'noop', totalLines, changedLines: 0, file: opts.file }) + '\n');
    process.exit(0);
  }

  // Race guard: if mtime advanced during our read, abort — another process appended.
  const mtimeAfter = statSync(opts.file).mtimeMs;
  if (mtimeAfter !== mtimeBefore && !opts.force) {
    process.stderr.write(JSON.stringify({
      error: 'mtime-changed-during-read',
      message: 'File was modified during redaction read; aborted to avoid losing appended data. Retry when idle or use --force.',
      file: opts.file,
    }) + '\n');
    process.exit(4);
  }

  let backup = null;
  if (opts.backup) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    backup = `${opts.file}.bak-${ts}`;
    copyFileSync(opts.file, backup);
  }

  const tmp = `${opts.file}.tmp`;
  writeFileSync(tmp, outLines.join('\n'), 'utf-8');
  renameSync(tmp, opts.file);

  process.stdout.write(JSON.stringify({
    mode: 'rewrite', totalLines, changedLines, file: opts.file, backup,
  }) + '\n');
  process.exit(0);
}

main();
