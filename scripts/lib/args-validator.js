// scripts/lib/args-validator.js — Validate user-supplied args before they
// reach `spawn(node, [...], { shell: false })` in runSkill / cron-runner.
//
// Threat model: with shell:false, argv is passed directly to the executable
// — no shell metacharacter interpretation. The ONLY characters that can
// corrupt argv parsing or break log files are:
//   - \0 (null byte): terminates C-strings; some libc layers truncate args
//   - \n (newline) and \r: break NDJSON log entries (one entry per line)
//
// Bug-fix S3 history: an earlier regex blocked spaces, breaking multi-word
// inputs. The current regex `/[\0\n\r]/` is the minimal safe ban list.
//
// Single source of truth — also consumed by centre/api/system.js runSkill
// AND the smoke-args-validation test harness.

export const ARGS_FORBIDDEN_RE = /[\0\n\r]/;
export const ARGS_MAX_LEN = 1000;

/**
 * Validate a user-supplied skill args string.
 *
 * @param {string} args
 * @returns {{ok: true} | {ok: false, error: string}}
 */
export function validateRunSkillArgs(args) {
  if (typeof args !== 'string') {
    return { ok: false, error: 'args: must be a string' };
  }
  if (ARGS_FORBIDDEN_RE.test(args)) {
    return { ok: false, error: 'args: contine caractere interzise (newlines sau null byte)' };
  }
  if (args.length > ARGS_MAX_LEN) {
    return { ok: false, error: `args: max ${ARGS_MAX_LEN} caractere` };
  }
  return { ok: true };
}
