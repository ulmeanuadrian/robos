#!/usr/bin/env node
/**
 * cron-daemon.js — daemon standalone pentru cron.
 *
 * NOTA: scheduler-ul ruleaza in-process in centre/server.js incepand cu v0.2.1.
 * Cand pornesti dashboard-ul (`bash scripts/start.sh`), cron-ul porneste automat.
 *
 * Acest daemon e util DOAR daca vrei cron fara dashboard pornit.
 *
 * Foloseste exact aceeasi logica (cron-scheduler.js + cron-runner.js) ca server-ul.
 * Nu duplica code path-uri.
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { startScheduler, stopScheduler } from '../lib/cron-scheduler.js';
import { closeDb } from '../lib/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROBOS_ROOT = join(__dirname, '..', '..');
const STATUS_DIR = join(ROBOS_ROOT, 'cron', 'status');
const PID_FILE = join(STATUS_DIR, 'daemon.pid');

function checkClaude() {
  try {
    execSync('which claude', { stdio: 'pipe' });
    return true;
  } catch {
    try {
      execSync('where claude', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }
}

function writePid() {
  mkdirSync(STATUS_DIR, { recursive: true });
  writeFileSync(PID_FILE, process.pid.toString(), 'utf-8');
}

function cleanup() {
  try { stopScheduler(); } catch { /* ignore */ }
  try {
    if (existsSync(PID_FILE)) {
      const pid = readFileSync(PID_FILE, 'utf-8').trim();
      if (pid === process.pid.toString()) {
        writeFileSync(PID_FILE, '', 'utf-8');
      }
    }
  } catch { /* ignore */ }
  closeDb();
  console.log('[daemon] oprit');
  process.exit(0);
}

// === Main ===
if (!checkClaude()) {
  console.error('EROARE: Claude CLI nu e gasit. Instaleaza: https://docs.anthropic.com/en/docs/claude-code');
  process.exit(1);
}

writePid();
console.log(`robOS cron daemon (standalone) — PID ${process.pid}`);
console.log('NOTA: pentru cron + dashboard intr-un singur proces, foloseste `bash scripts/start.sh`.');

startScheduler();

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// Tine procesul viu
setInterval(() => { /* heartbeat */ }, 60_000);
