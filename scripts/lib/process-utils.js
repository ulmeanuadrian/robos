// scripts/lib/process-utils.js — Cross-platform process detection.
//
// process.kill(pid, 0) is the standard Node way: throws ESRCH if dead, no-op if alive.
// Works on Windows AND Mac/Linux. Wrapped here for clarity + safe error handling.

/**
 * Check if a process with given PID is currently running.
 * Cross-platform (Windows + POSIX).
 *
 * @param {number|string} pid
 * @returns {boolean} true if alive, false otherwise (incl. invalid pid, dead, no-permission)
 */
export function isProcessAlive(pid) {
  const n = typeof pid === 'string' ? parseInt(pid, 10) : pid;
  if (!Number.isInteger(n) || n <= 0) return false;
  try {
    process.kill(n, 0); // signal 0 = existence check
    return true;
  } catch (err) {
    // ESRCH = no such process; EPERM = process exists but we can't signal it
    // (still alive from our perspective, but we treat as "alive" only if EPERM)
    if (err.code === 'EPERM') return true;
    return false;
  }
}

/**
 * Try to kill a process gracefully (SIGTERM), then forcibly (SIGKILL after delay).
 * Returns the final state.
 *
 * @param {number|string} pid
 * @param {object} [opts]
 * @param {number} [opts.gracefulMs=2000] - wait between SIGTERM and SIGKILL
 * @returns {{ killed: boolean, method: 'SIGTERM'|'SIGKILL'|'already-dead' }}
 */
export function killProcessSync(pid, opts = {}) {
  const { gracefulMs = 2000 } = opts;
  const n = typeof pid === 'string' ? parseInt(pid, 10) : pid;
  if (!Number.isInteger(n) || n <= 0) {
    return { killed: false, method: 'already-dead' };
  }

  if (!isProcessAlive(n)) {
    return { killed: true, method: 'already-dead' };
  }

  try {
    process.kill(n, 'SIGTERM');
  } catch {
    // Already dead or permission denied
    return { killed: !isProcessAlive(n), method: 'SIGTERM' };
  }

  // Spin-wait for graceful shutdown
  const until = Date.now() + gracefulMs;
  while (Date.now() < until) {
    if (!isProcessAlive(n)) return { killed: true, method: 'SIGTERM' };
  }

  // Forceful kill
  try {
    process.kill(n, 'SIGKILL');
  } catch { /* may already be dead */ }

  return { killed: !isProcessAlive(n), method: 'SIGKILL' };
}
