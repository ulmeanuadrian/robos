#!/usr/bin/env node
/**
 * redact-activity-log.js
 *
 * One-off remediation: re-runs current redaction patterns over an existing
 * NDJSON log on disk. Use after extending `scripts/lib/redact.js` with new
 * patterns, when prior log entries may contain credentials the old patterns
 * missed.
 *
 * Default target: data/activity-log.ndjson. Override with --file <path>.
 *
 * Behavior:
 *   1. Reads each line as JSON, redacts string fields known to hold user/
 *      assistant text (user_prompt, assistant_summary, tool_actions[]).
 *   2. Atomic rewrite via .tmp + rename.
 *   3. Reports how many lines changed.
 *
 * Backup is OPT-IN (--backup) because the whole point of redaction is to
 * scrub credentials from disk; a default `.bak-` file would defeat the
 * remediation by leaving an unredacted copy alongside the cleaned one.
 * Use --backup only when you trust the surrounding directory ACLs and
 * intend to delete the backup yourself afterwards.
 *
 * Idempotent: running twice on already-redacted content is a no-op.
 *
 * CLI:
 *   node scripts/redact-activity-log.js                       # default file, no backup
 *   node scripts/redact-activity-log.js --file path/to.ndjson
 *   node scripts/redact-activity-log.js --dry-run             # report, no write
 *   node scripts/redact-activity-log.js --backup              # opt-in: keep .bak- copy
 */

import { readFileSync, writeFileSync, renameSync, copyFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { redactSensitive } from './lib/redact.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROBOS_ROOT = join(__dirname, '..');

const REDACTABLE_FIELDS = ['user_prompt', 'assistant_summary'];

function parseArgs(argv) {
  const opts = { file: join(ROBOS_ROOT, 'data', 'activity-log.ndjson'), dryRun: false, backup: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--file') opts.file = argv[++i];
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--backup') opts.backup = true;
  }
  return opts;
}

function redactEntry(entry) {
  let changed = false;
  const out = { ...entry };
  for (const f of REDACTABLE_FIELDS) {
    if (typeof out[f] === 'string') {
      const redacted = redactSensitive(out[f]);
      if (redacted !== out[f]) {
        out[f] = redacted;
        changed = true;
      }
    }
  }
  if (Array.isArray(out.tool_actions)) {
    const redacted = out.tool_actions.map((a) => (typeof a === 'string' ? redactSensitive(a) : a));
    if (redacted.some((a, i) => a !== out.tool_actions[i])) {
      out.tool_actions = redacted;
      changed = true;
    }
  }
  return { entry: out, changed };
}

function main() {
  const opts = parseArgs(process.argv);
  if (!existsSync(opts.file)) {
    process.stderr.write(`File not found: ${opts.file}\n`);
    process.exit(1);
  }

  const content = readFileSync(opts.file, 'utf-8');
  const lines = content.split('\n');
  let totalLines = 0;
  let changedLines = 0;
  const outLines = [];

  for (const line of lines) {
    if (!line.trim()) { outLines.push(line); continue; }
    totalLines++;
    let entry;
    try { entry = JSON.parse(line); }
    catch {
      outLines.push(line); // keep corrupt lines as-is
      continue;
    }
    const { entry: redacted, changed } = redactEntry(entry);
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

  // Optional backup (off by default — redaction goal is to scrub disk).
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
    mode: 'rewrite',
    totalLines,
    changedLines,
    file: opts.file,
    backup,
  }) + '\n');
  process.exit(0);
}

main();
