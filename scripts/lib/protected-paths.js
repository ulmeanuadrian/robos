// scripts/lib/protected-paths.js — Authoritative list of files/dirs that
// `update.js` (and any future updater) MUST NEVER overwrite.
//
// Single source of truth for "user data that survives updates":
//   - brand/* (voice, audience, positioning, samples)
//   - context/* (USER.md, learnings.md, memory/, audits/, decision-journal.md, notes/)
//   - clients/* (per-client workspaces)
//   - projects/* (skill outputs)
//   - cron/jobs/* (operator-scheduled jobs)
//   - data/* (DB, telemetry, activity log, state)
//   - .env (.env.bak rolling backup also protected)
//   - connections.md (operator-authored tool inventory)
//
// If a future feature creates a new user-data location, add it here. The
// smoke `smoke-update-preserves-user-files.js` consumes this and would fail
// if the list shrinks below known requirements.

export const PROTECTED_PATHS = [
  'brand/',
  'context/',
  'clients/',
  'projects/',
  'cron/jobs/',
  'data/',
  '.env',
  '.env.bak',
  'connections.md',
];

/**
 * True if `relPath` is inside a protected location (or IS a protected file).
 * Operates on forward-slash normalized paths.
 *
 * @param {string} relPath  path relative to ROBOS_ROOT
 * @returns {boolean}
 */
export function isProtected(relPath) {
  if (typeof relPath !== 'string' || !relPath) return false;
  const norm = relPath.replace(/\\/g, '/');
  return PROTECTED_PATHS.some((p) => {
    if (p.endsWith('/')) {
      // Directory protection: match exact dir or any descendant
      return norm === p.slice(0, -1) || norm.startsWith(p);
    }
    // File protection: exact match
    return norm === p;
  });
}
