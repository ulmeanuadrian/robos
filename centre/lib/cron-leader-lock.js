// Cron leader lock — exactly one process schedules cron jobs at a time.
//
// Why: cron-scheduler.js runs in-process inside the Centre dashboard. Older
// daemon (scripts/start-crons.sh) can also start a separate scheduler. If both
// run, jobs fire twice. Lock prevents that.
//
// Mechanics:
//   - Lock file: data/cron-leader.lock with { pid, hostname, started_at, last_heartbeat }
//   - acquire(): if no lock OR heartbeat stale (>30s) → take over; else become passive
//   - heartbeat: update last_heartbeat every 10s while leader
//   - release(): delete lock file (called on graceful shutdown)
//   - Crash recovery: stale heartbeat detected by next process trying to acquire
//
// Atomicity: write with flag 'wx' (fail if exists). On race lose, recheck staleness.

import { existsSync, readFileSync, unlinkSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { hostname } from 'node:os';
import { dataDir } from './config.js';
import { atomicWrite } from '../../scripts/lib/atomic-write.js';

const LOCK_PATH = join(dataDir, 'cron-leader.lock');
const HEARTBEAT_INTERVAL_MS = 10_000;
const STALE_THRESHOLD_MS = 30_000;

let heartbeatTimer = null;
let isLeader = false;

function ensureDataDir() {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
}

function readLock() {
  if (!existsSync(LOCK_PATH)) return null;
  try {
    return JSON.parse(readFileSync(LOCK_PATH, 'utf-8'));
  } catch {
    return null; // corrupt → treat as no lock
  }
}

/**
 * Exclusive create. Returns true if WE created the file, false if it already
 * existed. Used for INITIAL acquire — guarantees only one of N racing
 * processes becomes leader.
 *
 * S28 fix (2026-05-12 codex audit BLOCKER): previous `writeLock` always used
 * atomicWrite (temp+rename, NOT exclusive). Two processes could both create
 * different temp files and both rename over the target — both believed they
 * were leader, ran cron jobs in parallel, produced duplicate side effects.
 * `wx` flag is atomic at the OS level (POSIX O_CREAT|O_EXCL, Windows
 * CREATE_NEW) so exactly one writer wins the race.
 */
function writeLockExclusive(payload) {
  try {
    writeFileSync(LOCK_PATH, JSON.stringify(payload, null, 2), { flag: 'wx' });
    return true;
  } catch (e) {
    if (e.code === 'EEXIST') return false;
    throw e;
  }
}

/**
 * Update an existing lock we already own (heartbeat path). Uses atomic
 * temp+rename — crash mid-write can't leave an empty/corrupt lock. Safe
 * because at heartbeat time we've already proven we're the leader.
 */
function writeLockHeartbeat(payload) {
  // F14 fix: atomic write — heartbeat updates are now safe under crash. Previous
  // plain writeFileSync left the lock file empty/corrupt if the process crashed
  // mid-write, allowing two leaders briefly. atomicWrite uses temp+rename with
  // random suffix so a partial write never overwrites the live lock.
  atomicWrite(LOCK_PATH, JSON.stringify(payload, null, 2));
}

function isStale(lock) {
  if (!lock || typeof lock.last_heartbeat !== 'number') return true;
  return Date.now() - lock.last_heartbeat > STALE_THRESHOLD_MS;
}

function isProcessAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Try to become leader. Returns true if acquired, false if another active leader exists.
 *
 * Re-entrant: if this process already holds the lock, returns true without
 * re-writing (idempotent — caller can retry safely).
 */
export function tryAcquire() {
  ensureDataDir();
  const existing = readLock();

  // Re-entrant: lock already mine
  if (existing && existing.pid === process.pid) {
    isLeader = true;
    if (!heartbeatTimer) startHeartbeat();
    return true;
  }

  if (existing && !isStale(existing) && isProcessAlive(existing.pid)) {
    // Active leader exists (different process), healthy heartbeat
    return false;
  }

  // Stale or dead — best-effort unlink so exclusive create below can succeed.
  // If unlink fails or another process unlinked first, that's fine — the wx
  // gate below is the real arbiter.
  if (existing) {
    console.log(`[cron-lock] preluare: lock vechi PID ${existing.pid} (${isStale(existing) ? 'heartbeat stale' : 'proces mort'})`);
    try { unlinkSync(LOCK_PATH); } catch { /* may already be gone */ }
  }

  const payload = {
    pid: process.pid,
    hostname: hostname(),
    started_at: Date.now(),
    last_heartbeat: Date.now(),
  };

  // S28 fix: exclusive-create with 'wx'. If another process beat us between
  // our staleness check and this write, the OS rejects us atomically — we
  // return false and let them be leader. NO race window where two processes
  // both believe they hold the lock.
  let acquired;
  try {
    acquired = writeLockExclusive(payload);
  } catch (e) {
    console.warn(`[cron-lock] nu pot scrie lock-ul: ${e.message}`);
    return false;
  }

  if (!acquired) {
    // EEXIST — someone else won the race. Re-read so caller knows who.
    const winner = readLock();
    if (winner) {
      console.log(`[cron-lock] race pierdut catre PID ${winner.pid} — raman pasiv`);
    }
    return false;
  }

  // Defense-in-depth: re-read to verify we still own the lock. If another
  // process unlinked + recreated in the microsecond window after our wx,
  // this catches it before we declare leadership.
  const verify = readLock();
  if (!verify || verify.pid !== process.pid) {
    console.warn('[cron-lock] verify a esuat — lock-ul nu mai e al nostru');
    return false;
  }

  isLeader = true;
  startHeartbeat();
  console.log(`[cron-lock] devenit leader (PID ${process.pid})`);
  return true;
}

function startHeartbeat() {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(() => {
    if (!isLeader) return;
    try {
      const lock = readLock();
      // If someone else stole the lock (PID changed), step down
      if (!lock || lock.pid !== process.pid) {
        console.warn('[cron-lock] lock-ul a fost preluat de alt proces — abdic');
        isLeader = false;
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
        return;
      }
      lock.last_heartbeat = Date.now();
      writeLockHeartbeat(lock);
    } catch (e) {
      console.warn(`[cron-lock] heartbeat fail: ${e.message}`);
    }
  }, HEARTBEAT_INTERVAL_MS);
  heartbeatTimer.unref?.(); // don't keep event loop alive
}

/**
 * Release the lock. Safe to call even if not leader.
 */
export function release() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (!isLeader) return;
  isLeader = false;
  try {
    const lock = readLock();
    if (lock && lock.pid === process.pid) {
      unlinkSync(LOCK_PATH);
      console.log('[cron-lock] lock eliberat');
    }
  } catch { /* ignore */ }
}

/**
 * Public read-only check: am I leader right now?
 */
export function amILeader() {
  return isLeader;
}

/**
 * Public read-only inspection — for /status endpoints.
 */
export function inspectLock() {
  const lock = readLock();
  if (!lock) return { exists: false };
  return {
    exists: true,
    pid: lock.pid,
    hostname: lock.hostname,
    started_at: lock.started_at,
    last_heartbeat: lock.last_heartbeat,
    age_ms: Date.now() - lock.last_heartbeat,
    stale: isStale(lock),
  };
}
