#!/usr/bin/env node
/**
 * robOS Cron Daemon (Node.js)
 * Replaces the bash daemon. Uses croner for schedule matching.
 * Spawns `claude -p` for each matched job with concurrency limit.
 */

import { Cron } from 'croner';
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { execSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROBOS_ROOT = join(__dirname, '..', '..');
const JOBS_DIR = join(ROBOS_ROOT, 'cron', 'jobs');
const LOGS_DIR = join(ROBOS_ROOT, 'cron', 'logs');
const STATUS_DIR = join(ROBOS_ROOT, 'cron', 'status');
const PID_FILE = join(STATUS_DIR, 'daemon.pid');

const MAX_CONCURRENT = 3;
let running = 0;
const cronJobs = new Map();

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  try {
    const logFile = join(LOGS_DIR, `daemon-${ts.slice(0, 10)}.log`);
    writeFileSync(logFile, line + '\n', { flag: 'a' });
  } catch { /* best effort */ }
}

function checkClaude() {
  try {
    execSync('which claude', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function loadJobs() {
  if (!existsSync(JOBS_DIR)) return [];

  return readdirSync(JOBS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try {
        const raw = readFileSync(join(JOBS_DIR, f), 'utf-8');
        return { file: f, ...JSON.parse(raw) };
      } catch (e) {
        log(`WARN: Failed to parse ${f}: ${e.message}`);
        return null;
      }
    })
    .filter(Boolean);
}

function executeJob(job) {
  if (running >= MAX_CONCURRENT) {
    log(`SKIP: ${job.name} (max concurrent ${MAX_CONCURRENT} reached)`);
    return;
  }

  running++;
  const startTime = Date.now();
  const runLog = join(LOGS_DIR, `${job.name}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.log`);

  const prompt = job.skill
    ? `Run skill ${job.skill}${job.args ? ' with args: ' + JSON.stringify(job.args) : ''}`
    : job.prompt || `Run job: ${job.name}`;

  log(`RUN: ${job.name} (skill: ${job.skill || 'none'})`);

  const child = spawn('claude', ['-p', prompt], {
    cwd: ROBOS_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  let output = '';
  child.stdout.on('data', d => { output += d.toString(); });
  child.stderr.on('data', d => { output += d.toString(); });

  child.on('close', code => {
    running--;
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const status = code === 0 ? 'success' : 'failure';

    log(`DONE: ${job.name} (${status}, ${duration}s, exit ${code})`);

    try {
      writeFileSync(runLog, output, 'utf-8');
    } catch { /* best effort */ }

    try {
      writeFileSync(
        join(STATUS_DIR, `${job.name}.status`),
        JSON.stringify({
          name: job.name,
          last_run: new Date().toISOString(),
          status,
          duration: parseFloat(duration),
          exit_code: code,
        }),
        'utf-8'
      );
    } catch { /* best effort */ }
  });

  const timeout = parseTimeout(job.timeout || '30m');
  setTimeout(() => {
    if (!child.killed) {
      child.kill('SIGTERM');
      log(`TIMEOUT: ${job.name} killed after ${job.timeout || '30m'}`);
    }
  }, timeout);
}

function parseTimeout(str) {
  const match = str.match(/^(\d+)(s|m|h)$/);
  if (!match) return 30 * 60 * 1000;
  const val = parseInt(match[1]);
  switch (match[2]) {
    case 's': return val * 1000;
    case 'm': return val * 60 * 1000;
    case 'h': return val * 3600 * 1000;
    default: return 30 * 60 * 1000;
  }
}

function scheduleJobs() {
  // Stop existing cron instances
  for (const [, cron] of cronJobs) {
    cron.stop();
  }
  cronJobs.clear();

  const jobs = loadJobs();
  let scheduled = 0;

  for (const job of jobs) {
    if (job.enabled === false) continue;
    if (!job.schedule) {
      log(`SKIP: ${job.name} (no schedule)`);
      continue;
    }

    try {
      const cron = new Cron(job.schedule, () => {
        executeJob(job);
      });
      cronJobs.set(job.name, cron);
      scheduled++;
    } catch (e) {
      log(`ERROR: Invalid schedule for ${job.name}: ${e.message}`);
    }
  }

  return scheduled;
}

function writePid() {
  mkdirSync(STATUS_DIR, { recursive: true });
  mkdirSync(LOGS_DIR, { recursive: true });
  writeFileSync(PID_FILE, process.pid.toString(), 'utf-8');
}

function cleanup() {
  for (const [, cron] of cronJobs) {
    cron.stop();
  }
  try {
    if (existsSync(PID_FILE)) {
      const pid = readFileSync(PID_FILE, 'utf-8').trim();
      if (pid === process.pid.toString()) {
        writeFileSync(PID_FILE, '', 'utf-8');
      }
    }
  } catch { /* best effort */ }
  log('Daemon stopped');
  process.exit(0);
}

// Main
if (!checkClaude()) {
  console.error('ERROR: Claude CLI not found. Install: https://docs.anthropic.com/en/docs/claude-code');
  process.exit(1);
}

writePid();

const count = scheduleJobs();
log(`Daemon started. ${count} job(s) scheduled. PID ${process.pid}`);
console.log(`robOS cron daemon started (PID ${process.pid})`);
console.log(`Jobs: ${count}`);
console.log(`Logs: cron/logs/`);
console.log('Stop with: ./scripts/stop-crons.sh');

// Reload jobs every 5 minutes (picks up new/changed files)
setInterval(() => {
  const newCount = scheduleJobs();
  log(`Jobs reloaded: ${newCount} scheduled`);
}, 5 * 60 * 1000);

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
