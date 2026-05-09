#!/usr/bin/env node
// scripts/start-crons.js — Cross-platform cron daemon launcher.
//
// Replaces start-crons.sh. Behavior:
//   1. Verify data/robos.db exists (else: prompt to run setup).
//   2. If dashboard is running (centre/.../server.pid alive) → scheduler is
//      already in-process. Exit 0 with note.
//   3. Else: spawn detached node centre/scripts/cron-daemon.js, write PID,
//      print status.

import { existsSync, readFileSync, writeFileSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { isProcessAlive } from './lib/process-utils.js';

const __filename = fileURLToPath(import.meta.url);
const ROBOS_ROOT = join(dirname(__filename), '..');
const PID_DIR = join(ROBOS_ROOT, 'cron', 'status');
const PID_FILE = join(PID_DIR, 'daemon.pid');
const DB_PATH = join(ROBOS_ROOT, 'data', 'robos.db');
const SERVER_PID_FILE = join(ROBOS_ROOT, '.command-centre', 'server.pid');
const DAEMON_SCRIPT = join(ROBOS_ROOT, 'centre', 'scripts', 'cron-daemon.js');
const LOGS_DIR = join(ROBOS_ROOT, 'cron', 'logs');

function ensureDir(d) { if (!existsSync(d)) mkdirSync(d, { recursive: true }); }
function todayISO() { return new Date().toISOString().slice(0, 10); }

function readPid(path) {
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, 'utf-8').trim();
    const n = parseInt(raw, 10);
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch { return null; }
}

async function main() {
  ensureDir(PID_DIR);
  ensureDir(LOGS_DIR);

  if (!existsSync(DB_PATH)) {
    console.error(`EROARE: ${DB_PATH} nu exista. Ruleaza node scripts/setup.js inainte.`);
    process.exit(1);
  }

  // Check if dashboard server is running (in-process scheduler)
  const serverPid = readPid(SERVER_PID_FILE);
  if (serverPid && isProcessAlive(serverPid)) {
    console.log(`Dashboard-ul ruleaza (PID ${serverPid}) — scheduler-ul cron e deja activ in-process.`);
    console.log('Nu trebuie daemon separat. Verifica status: node scripts/status-crons.js');
    process.exit(0);
  }

  // Check if standalone daemon already running
  const oldPid = readPid(PID_FILE);
  if (oldPid && isProcessAlive(oldPid)) {
    console.log(`Daemon standalone deja ruleaza (PID ${oldPid})`);
    process.exit(0);
  }
  // Stale PID file: remove silently
  if (existsSync(PID_FILE)) {
    try { writeFileSync(PID_FILE, '', 'utf-8'); } catch {}
  }

  if (!existsSync(DAEMON_SCRIPT)) {
    console.error(`EROARE: ${DAEMON_SCRIPT} nu exista. Ruleaza node scripts/setup.js inainte.`);
    process.exit(1);
  }

  // Lazy job-count via dynamic import (top-level await alternative)
  let jobCount;
  try {
    const Database = (await import('better-sqlite3')).default;
    const db = new Database(DB_PATH, { readonly: true });
    try {
      const row = db.prepare('SELECT COUNT(*) AS n FROM cron_jobs WHERE active = 1').get();
      jobCount = row?.n ?? 0;
    } finally { db.close(); }
  } catch {
    jobCount = '?';
  }

  // Spawn detached daemon. stdio piped to log file so the daemon can survive
  // parent exit. Cross-platform: spawn(node, ...) with detached + unref.
  const logPath = join(LOGS_DIR, `daemon-${todayISO()}.log`);
  const out = openSync(logPath, 'a');
  const err = openSync(logPath, 'a');

  const child = spawn(process.execPath, [DAEMON_SCRIPT], {
    cwd: ROBOS_ROOT,
    detached: true,
    stdio: ['ignore', out, err],
    windowsHide: true,
    shell: false,
  });

  closeSync(out);
  closeSync(err);

  if (!child.pid) {
    console.error('EROARE: spawn cron-daemon a esuat (nu am PID).');
    process.exit(1);
  }

  writeFileSync(PID_FILE, String(child.pid), 'utf-8');
  child.unref();

  console.log(`Daemon standalone pornit (PID ${child.pid}). ${jobCount} job(uri) active in DB.`);
  console.log('');
  console.log('Pentru a-l opri: node scripts/stop-crons.js');
  console.log('Pentru status:    node scripts/status-crons.js');
  console.log('');
  console.log('TIP: daca pornesti dashboard-ul (node scripts/robos.js), scheduler-ul ruleaza in-process — nu e nevoie de daemon separat.');
}

main().catch(err => {
  console.error('EROARE:', err.message);
  process.exit(1);
});
