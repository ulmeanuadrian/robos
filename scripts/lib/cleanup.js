// scripts/lib/cleanup.js — Age-based directory pruning helpers.
//
// F5 fix: data/session-state/ accumulated 69+ files (33 markers, 20 checkpoints,
// 2 tools.json, smoke leftovers). Zero retention policy. At 1-3 sessions/day
// this grows to 1000+ files/year — every readdirSync() in detectors becomes
// O(n) syscalls.
//
// F10 fix: data/session-recovery/ marked files consumed:true but never deleted.
// Linear-growth read at every cold-session start.
//
// pruneDirByAge unlinks files older than maxAgeDays. Optional predicate filter.
// Cross-platform: pure Node fs (statSync mtime, unlinkSync).

import { readdirSync, statSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Remove files in `dir` older than `maxAgeDays` (by mtime).
 *
 * @param {string} dir - absolute directory path
 * @param {number} maxAgeDays - days; files older than this are unlinked
 * @param {object} [opts]
 * @param {(name: string, stat: import('node:fs').Stats) => boolean} [opts.predicate]
 *   Optional: extra filter. Return true to allow removal, false to keep.
 * @returns {{ removed: number, kept: number, errors: number }}
 */
export function pruneDirByAge(dir, maxAgeDays, opts = {}) {
  const result = { removed: 0, kept: 0, errors: 0 };
  if (!existsSync(dir)) return result;

  const cutoffMs = Date.now() - maxAgeDays * 86400_000;
  const predicate = opts.predicate || (() => true);

  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    result.errors++;
    return result;
  }

  for (const name of entries) {
    const path = join(dir, name);
    let stat;
    try {
      stat = statSync(path);
    } catch {
      result.errors++;
      continue;
    }
    if (!stat.isFile()) {
      result.kept++;
      continue;
    }
    if (stat.mtimeMs >= cutoffMs) {
      result.kept++;
      continue;
    }
    if (!predicate(name, stat)) {
      result.kept++;
      continue;
    }
    try {
      unlinkSync(path);
      result.removed++;
    } catch {
      result.errors++;
    }
  }

  return result;
}
