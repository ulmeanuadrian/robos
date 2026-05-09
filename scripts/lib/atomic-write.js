// scripts/lib/atomic-write.js — Cross-platform atomic file write.
//
// Pattern: write content to a unique tmp file, then rename over the target.
// Rename is atomic on NTFS (Windows) and POSIX filesystems for same-volume
// same-name operations.
//
// F4 fix: previous duplicated atomicWrite() implementations in loop-detector.js
// and client-context.js had no cleanup on failure — leaving *.tmp files when
// renameSync threw EBUSY/EPERM (Windows file lock). ndjson-log.js used
// non-randomized `.tmp` suffix, racing concurrent rotations. Unified here:
//   - random hex suffix → no collision
//   - try/finally cleanup → no orphan tmp on failure
//   - retry-with-backoff on EBUSY/EPERM (Windows reads)
//
// Cross-platform notes:
//   - Windows: rename-over-open-file may throw EBUSY/EPERM. Retry handles it.
//     If still fails after retries, surface the error and clean up tmp.
//   - POSIX: rename is fully atomic. No retry needed but harmless.
//   - mode: passed to writeFileSync; on Windows mode is largely ignored
//     (NTFS ACLs), on POSIX it sets file permissions.

import { writeFileSync, renameSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

/**
 * Atomic write with cleanup on failure.
 *
 * @param {string} targetPath - destination file
 * @param {string|Buffer} content - data to write
 * @param {object} [options]
 * @param {string} [options.encoding='utf-8'] - text encoding (ignored for Buffer)
 * @param {number} [options.mode] - POSIX file mode (e.g. 0o600). Optional.
 * @param {number} [options.retries=3] - retry count for EBUSY/EPERM
 * @param {number} [options.retryDelayMs=50] - delay between retries
 * @returns {void}
 * @throws {Error} on unrecoverable failure (with tmp file already cleaned)
 */
export function atomicWrite(targetPath, content, options = {}) {
  const {
    encoding = 'utf-8',
    mode,
    retries = 3,
    retryDelayMs = 50,
  } = options;

  const dir = dirname(targetPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const tmpPath = `${targetPath}.${randomBytes(4).toString('hex')}.tmp`;
  let renamed = false;

  try {
    const writeOpts = mode !== undefined ? { encoding, mode } : { encoding };
    writeFileSync(tmpPath, content, writeOpts);

    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        renameSync(tmpPath, targetPath);
        renamed = true;
        return;
      } catch (err) {
        lastErr = err;
        // Only retry on Windows file-lock errors. Other errors (EACCES, ENOSPC)
        // won't be helped by retry.
        if (err.code !== 'EBUSY' && err.code !== 'EPERM' && err.code !== 'EACCES') {
          throw err;
        }
        if (attempt < retries) {
          // Synchronous busy-wait — short and bounded. We're in a hook script
          // context where setTimeout can't be awaited inside a sync API. The
          // total worst-case wait is retries * retryDelayMs (default 150ms).
          const until = Date.now() + retryDelayMs;
          while (Date.now() < until) { /* spin */ }
        }
      }
    }
    throw lastErr;
  } finally {
    if (!renamed && existsSync(tmpPath)) {
      try { unlinkSync(tmpPath); } catch { /* best-effort */ }
    }
  }
}
