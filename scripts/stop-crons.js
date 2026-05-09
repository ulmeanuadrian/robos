#!/usr/bin/env node
// scripts/stop-crons.js — Cross-platform cron daemon stopper.
//
// Replaces stop-crons.sh. Reads cron/status/daemon.pid, sends SIGTERM (then
// SIGKILL fallback). Cross-platform via process.kill (works on Win + Mac).

import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isProcessAlive, killProcessSync } from './lib/process-utils.js';

const __filename = fileURLToPath(import.meta.url);
const ROBOS_ROOT = join(dirname(__filename), '..');
const PID_FILE = join(ROBOS_ROOT, 'cron', 'status', 'daemon.pid');

if (!existsSync(PID_FILE)) {
  console.log('Cron daemon nu ruleaza (fara PID file)');
  process.exit(0);
}

let pid;
try {
  pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10);
} catch {
  console.log('PID file corupt — sterg si ies');
  try { unlinkSync(PID_FILE); } catch {}
  process.exit(0);
}

if (!Number.isInteger(pid) || pid <= 0) {
  console.log('PID invalid in fisier — sterg si ies');
  try { unlinkSync(PID_FILE); } catch {}
  process.exit(0);
}

if (!isProcessAlive(pid)) {
  console.log(`Cron daemon nu rula (PID vechi ${pid})`);
  try { unlinkSync(PID_FILE); } catch {}
  process.exit(0);
}

const result = killProcessSync(pid, { gracefulMs: 2000 });
if (result.killed) {
  console.log(`Cron daemon oprit (PID ${pid}, method=${result.method})`);
} else {
  console.error(`AVERTISMENT: Nu am putut opri PID ${pid}. Manual: kill -9 ${pid}`);
  process.exit(1);
}

try { unlinkSync(PID_FILE); } catch {}
