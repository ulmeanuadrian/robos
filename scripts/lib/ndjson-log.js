/**
 * ndjson-log.js
 *
 * Helper partajat pentru NDJSON logs cu rotation.
 * Cap fiecare log la N linii — peste limita, pastreaza ultimele N (drop oldest).
 *
 * Folosit de: audit-startup.js, session-timeout-detector.js, learnings-aggregator.js,
 * activity-capture.js, hook-error-sink.js.
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, statSync, renameSync, unlinkSync } from 'fs';
import { dirname } from 'path';

const DEFAULT_MAX_LINES = 1000;

// Average line size estimate. We compute size cap as maxLines * AVG_LINE * SLACK.
// When file size exceeds this, we trigger rotation (which precisely counts lines).
// AVG_LINE = 200B is conservative; SLACK = 1.5 keeps rotations rare.
const AVG_LINE_BYTES = 200;
const ROTATION_SLACK = 1.5;

/**
 * Append o intrare la un NDJSON log file.
 *
 * Fast path: appendFileSync(path, line) — O(1), atomic small write.
 * Slow path (rotation): triggered when size exceeds maxLines * AVG_LINE * SLACK.
 *   Reads file, keeps last maxLines, writes to .tmp, atomic rename.
 *
 * Earlier implementation did read-modify-write on EVERY append, which:
 *   - Was O(N) per append (rewriting 150KB to add 200 bytes)
 *   - Had a race window between read and write where concurrent
 *     writers would overwrite each other's appends silently
 *
 * @param {string} path - cale absoluta la log
 * @param {object} entry - obiect care va fi serializat ca o linie
 * @param {object} opts
 * @param {number} opts.maxLines - default 1000
 */
export function appendNdjson(path, entry, { maxLines = DEFAULT_MAX_LINES } = {}) {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const line = JSON.stringify(entry) + '\n';

  // Cold start: file does not exist. Single atomic write.
  if (!existsSync(path)) {
    writeFileSync(path, line, 'utf-8');
    return;
  }

  // Fast path: append directly. Small writes (<PIPE_BUF on POSIX, locked
  // per-call on Win32 by Node) are atomic between concurrent writers.
  appendFileSync(path, line, 'utf-8');

  // Lazy rotation: only check size, not line count, on the hot path.
  // If size cap exceeded, do a real line-count rotation atomically.
  let size;
  try {
    size = statSync(path).size;
  } catch {
    return;
  }
  const sizeCap = maxLines * AVG_LINE_BYTES * ROTATION_SLACK;
  if (size <= sizeCap) return;

  rotateNdjson(path, maxLines);
}

/**
 * Atomically rotate an NDJSON file to keep only the last `maxLines` entries.
 * Writes to a sibling .tmp, then renames over the original (atomic on
 * NTFS/ext4 for same-volume same-name targets).
 */
function rotateNdjson(path, maxLines) {
  let lines;
  try {
    const existing = readFileSync(path, 'utf-8');
    lines = existing.split('\n').filter((l) => l.trim());
  } catch {
    return;
  }
  if (lines.length <= maxLines) return;

  const trimmed = lines.slice(-maxLines).join('\n') + '\n';
  const tmp = path + '.tmp';
  try {
    writeFileSync(tmp, trimmed, 'utf-8');
    renameSync(tmp, path);
  } catch {
    // Best-effort: if rotation fails, the file just stays large; reads
    // still work. Clean up tmp if it's lying around.
    try { unlinkSync(tmp); } catch {}
  }
}
