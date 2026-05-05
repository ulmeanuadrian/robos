/**
 * hook-error-sink.js
 *
 * Single error sink for hook scripts (UserPromptSubmit, Stop, cron).
 * Hook scripts MUST never block the user — we exit 0 even on error so
 * Claude Code keeps working. But that turns every silent failure into
 * a debugging mystery (e.g., a malformed _index.json silently disables
 * skill routing forever, with no surfacing).
 *
 * Logging through this sink turns silent failure into a visible,
 * rotated log: data/hook-errors.ndjson. Operator can scan it via
 *   node scripts/parallel-budget.js stats   (no — different log)
 * or just                                      cat data/hook-errors.ndjson
 *
 * Usage:
 *   import { logHookError } from './lib/hook-error-sink.js';
 *   try { ... } catch (e) { logHookError('hook-user-prompt', e, { extra: 'context' }); process.exit(0); }
 */

import { appendNdjson } from './ndjson-log.js';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const ROBOS_ROOT = dirname(dirname(dirname(__filename)));
const ERROR_LOG = join(ROBOS_ROOT, 'data', 'hook-errors.ndjson');

const MAX_LINES = 500;

/**
 * Log a hook error to data/hook-errors.ndjson (rotated, last 500).
 * Never throws — failure to log is silently swallowed (we are already
 * in an error path; double-faulting helps no one).
 *
 * @param {string} scope - short identifier of the failing hook/script
 * @param {Error|string} err - the error
 * @param {object} [meta] - extra context (sessionId, prompt prefix, etc.)
 */
export function logHookError(scope, err, meta = {}) {
  try {
    const entry = {
      ts: new Date().toISOString(),
      scope,
      message: err && err.message ? err.message : String(err),
      stack: err && err.stack ? err.stack.split('\n').slice(0, 5).join('\n') : null,
      ...meta,
    };
    appendNdjson(ERROR_LOG, entry, { maxLines: MAX_LINES });
  } catch {
    // Intentionally silent — this is the last-resort sink.
  }
}
