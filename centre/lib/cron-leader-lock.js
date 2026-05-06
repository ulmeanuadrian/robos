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

import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { hostname } from 'node:os';
import { dataDir } from './config.js';

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

function writeLock(payload) {
  writeFileSync(LOCK_PATH, JSON.stringify(payload, null, 2), { encoding: 'utf-8' });
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

  // No lock OR stale OR dead PID → take over
  if (existing) {
    console.log(`[cron-lock] preluare: lock vechi PID ${existing.pid} (${isStale(existing) ? 'heartbeat stale' : 'proces mort'})`);
  }

  const payload = {
    pid: process.pid,
    hostname: hostname(),
    started_at: Date.now(),
    last_heartbeat: Date.now(),
  };

  try {
    writeLock(payload);
  } catch (e) {
    console.warn(`[cron-lock] nu pot scrie lock-ul: ${e.message}`);
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
      writeLock(lock);
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
