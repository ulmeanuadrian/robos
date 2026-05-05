/**
 * memory-format.js
 *
 * Single source of truth for the daily memory file convention.
 *
 * Memory files live at context/memory/YYYY-MM-DD.md and follow this shape:
 *
 *   ## Session N
 *
 *   ### Goal
 *   ...
 *
 *   ### Deliverables
 *   - ...
 *
 *   ### Decisions
 *   - ...
 *
 *   ### Open Threads
 *   - ...
 *
 *   Session: 5 deliverables, 3 decisions     ← closing line written by sys-session-close
 *
 * Four scripts and counting depended on the closing pattern and the
 * Open Threads extractor:
 *   - hook-user-prompt.js (startup bundle, recovery flag detection)
 *   - audit-startup.js (cron — abandoned-session audit)
 *   - session-timeout-detector.js (cron — finds idle sessions)
 *   - lint-memory.js (validates memory shape pre-commit)
 *
 * Each had its own copy of the regex and the extractor. A single change
 * to the convention (e.g., translating "Session" to "Sesiune") would
 * have to land in 4 places or silently break 4 features. This module
 * is the single owner; consumers MUST import from here.
 */

/**
 * Closing line pattern. Skills (sys-session-close) write the literal
 * "Session: N deliverables, M decisions" at the end of a memory file
 * to mark a clean session close. Hooks and audits look for this pattern
 * to decide if a session was abandoned.
 */
export const CLOSING_PATTERN = /Session:\s*\d+\s*deliverables/i;

/**
 * Returns true if the memory file content has a clean-close pattern.
 * @param {string} content
 * @returns {boolean}
 */
export function isClosed(content) {
  if (typeof content !== 'string' || !content) return false;
  return CLOSING_PATTERN.test(content);
}

/**
 * Extracts the session count from a closing line, if present.
 * Returns N or null.
 */
export function getSessionDeliverableCount(content) {
  if (typeof content !== 'string' || !content) return null;
  const m = content.match(/Session:\s*(\d+)\s*deliverables/i);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Extract Open Threads bullet items from a memory file. Returns an
 * array of strings (the text after the bullet). Empty array if the
 * section is absent or empty.
 *
 * Looks at the LAST occurrence of `### Open Threads` (when a memory
 * file has multiple sessions, the latest is what we care about).
 *
 * @param {string} content
 * @returns {string[]}
 */
export function extractOpenThreads(content) {
  if (typeof content !== 'string' || !content) return [];

  const matches = [...content.matchAll(/###\s+Open\s+Threads\s*\n([\s\S]*?)(?=\n###|\n##|$)/gi)];
  if (matches.length === 0) return [];

  const lastSection = matches[matches.length - 1][1];
  return lastSection
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('-') || l.startsWith('*'))
    .map((l) => l.replace(/^[-*]\s+/, ''));
}

/**
 * Required section headers that lint-memory enforces per session.
 * Kept here so future schema changes (add a new required section)
 * are visible from one file.
 */
export const REQUIRED_SECTIONS = ['Goal', 'Deliverables', 'Decisions', 'Open Threads'];
