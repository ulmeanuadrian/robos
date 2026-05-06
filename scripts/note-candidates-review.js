#!/usr/bin/env node
/**
 * note-candidates-review.js
 *
 * CLI helper for the candidate-review flow surfaced at session start.
 *
 * Subcommands:
 *   list                              List pending candidates (last 7 days, max 10)
 *   confirm <id1,id2,...>             Promote candidates to real notes (via note-create.js)
 *   reject  <id1,id2,...>             Mark candidates as rejected (kept for heuristic learning)
 *   expire-old                        Mark pending candidates older than 14 days as expired
 *
 * Output: JSON for machine use; human-friendly text only on `list` without --json.
 *
 * The model never has to construct INSERT statements or manage candidate state —
 * it just calls these subcommands.
 */

import { spawnSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getDb, closeDb } from '../centre/lib/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROBOS_ROOT = join(__dirname, '..');
const NOTE_CREATE = join(ROBOS_ROOT, 'scripts', 'note-create.js');

function parseIds(s) {
  if (!s) return [];
  return s.split(',').map(x => x.trim()).filter(Boolean);
}

function listPending(opts) {
  const db = getDb();
  // Last 7 days, pending status, max 10. Order by detected_at desc so newest first.
  const rows = db.prepare(`
    SELECT id, trigger, excerpt, detected_at, session_id
    FROM note_candidates
    WHERE status = 'pending'
      AND detected_at >= datetime('now', '-7 days')
    ORDER BY detected_at DESC
    LIMIT ?
  `).all(opts.limit || 10);
  closeDb();
  return rows;
}

function deriveTitle(excerpt) {
  // First 60 chars of excerpt, broken at word boundary if possible.
  const trimmed = excerpt.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= 60) return trimmed;
  const cut = trimmed.slice(0, 60);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 30 ? cut.slice(0, lastSpace) : cut).replace(/[.,;:]+$/, '');
}

function tagFromTrigger(trigger) {
  switch (trigger) {
    case 'decizie':    return ['decision'];
    case 'regula':     return ['rule'];
    case 'important':  return ['important'];
    case 'tine-minte': return ['remember'];
    default:           return [];
  }
}

function confirmIds(ids) {
  if (!ids.length) return { confirmed: [], errors: [] };
  const db = getDb();

  const confirmed = [];
  const errors = [];

  const select = db.prepare(`SELECT id, trigger, excerpt FROM note_candidates WHERE id = ? AND status = 'pending'`);
  const update = db.prepare(`UPDATE note_candidates SET status = 'confirmed', reviewed_at = datetime('now'), promoted_to = ? WHERE id = ?`);

  for (const id of ids) {
    const row = select.get(id);
    if (!row) {
      errors.push({ id, reason: 'not-found-or-not-pending' });
      continue;
    }

    const title = deriveTitle(row.excerpt);
    const tags = tagFromTrigger(row.trigger).concat(['from-candidate']);

    // Spawn note-create.js with body via stdin (handles multiline safely).
    const proc = spawnSync(process.execPath, [
      NOTE_CREATE,
      '--title', title,
      '--tags', tags.join(','),
      '--origin', 'candidate',
      '--candidate-id', id,
    ], {
      input: row.excerpt,
      encoding: 'utf-8',
    });

    if (proc.status !== 0) {
      errors.push({ id, reason: `note-create failed: ${proc.stderr || 'unknown'}` });
      continue;
    }
    let created;
    try { created = JSON.parse(proc.stdout); } catch {
      errors.push({ id, reason: `note-create returned non-JSON: ${proc.stdout.slice(0, 100)}` });
      continue;
    }

    update.run(created.id, id);
    confirmed.push({ candidate_id: id, note_id: created.id, path: created.path });
  }

  closeDb();
  return { confirmed, errors };
}

function rejectIds(ids) {
  if (!ids.length) return { rejected: [] };
  const db = getDb();
  const update = db.prepare(`UPDATE note_candidates SET status = 'rejected', reviewed_at = datetime('now') WHERE id = ? AND status = 'pending'`);
  const rejected = [];
  for (const id of ids) {
    const r = update.run(id);
    if (r.changes > 0) rejected.push(id);
  }
  closeDb();
  return { rejected };
}

function expireOld() {
  const db = getDb();
  const r = db.prepare(`
    UPDATE note_candidates
    SET status = 'expired', reviewed_at = datetime('now')
    WHERE status = 'pending'
      AND detected_at < datetime('now', '-14 days')
  `).run();
  closeDb();
  return { expired: r.changes };
}

function main() {
  const cmd = process.argv[2];
  const arg = process.argv[3] || '';
  const json = process.argv.includes('--json');

  switch (cmd) {
    case 'list': {
      const rows = listPending({ limit: 10 });
      if (json) {
        process.stdout.write(JSON.stringify(rows, null, 2) + '\n');
      } else if (rows.length === 0) {
        process.stdout.write('Niciun candidat pending.\n');
      } else {
        process.stdout.write(`${rows.length} candidati pending:\n`);
        rows.forEach((r, i) => {
          process.stdout.write(`  ${i + 1}. [${r.trigger}] ${r.excerpt}\n     id=${r.id}  detected=${r.detected_at}\n`);
        });
      }
      break;
    }
    case 'confirm': {
      const result = confirmIds(parseIds(arg));
      process.stdout.write(JSON.stringify(result) + '\n');
      process.exit(result.errors.length ? 1 : 0);
    }
    case 'reject': {
      const result = rejectIds(parseIds(arg));
      process.stdout.write(JSON.stringify(result) + '\n');
      break;
    }
    case 'expire-old': {
      const result = expireOld();
      process.stdout.write(JSON.stringify(result) + '\n');
      break;
    }
    default:
      process.stderr.write(`Usage:
  note-candidates-review.js list [--json]
  note-candidates-review.js confirm <id1,id2,...>
  note-candidates-review.js reject  <id1,id2,...>
  note-candidates-review.js expire-old
`);
      process.exit(2);
  }
  process.exit(0);
}

main();
