#!/usr/bin/env node
// scripts/status-crons.js — Cross-platform cron status report.
//
// Replaces status-crons.sh. Reads PID, queries cron_jobs + last cron_runs from
// data/robos.db via better-sqlite3. Cross-platform: Mac + Windows.

import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isProcessAlive } from './lib/process-utils.js';

const __filename = fileURLToPath(import.meta.url);
const ROBOS_ROOT = join(dirname(__filename), '..');
const PID_FILE = join(ROBOS_ROOT, 'cron', 'status', 'daemon.pid');
const DB_PATH = join(ROBOS_ROOT, 'data', 'robos.db');

console.log('=== robOS Cron Status ===');
console.log('');

// Daemon status
if (existsSync(PID_FILE)) {
  let pid;
  try { pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10); } catch { pid = null; }
  if (pid && isProcessAlive(pid)) {
    console.log(`Daemon: RULEAZA (PID ${pid})`);
  } else {
    console.log('Daemon: OPRIT (PID file vechi)');
  }
} else {
  console.log('Daemon: OPRIT');
}

console.log('');

if (!existsSync(DB_PATH)) {
  console.error(`EROARE: ${DB_PATH} nu exista. Ruleaza node scripts/setup.js inainte.`);
  process.exit(1);
}

// Lazy-import better-sqlite3 (centre/node_modules) to query jobs.
let Database;
try {
  Database = (await import('better-sqlite3')).default;
} catch (err) {
  console.error('EROARE: better-sqlite3 nu e disponibil. Ruleaza node scripts/setup.js (npm install).');
  process.exit(1);
}

const db = new Database(DB_PATH, { readonly: true });
let jobs;
try {
  jobs = db.prepare(`
    SELECT
      j.slug, j.name, j.schedule, j.active,
      COALESCE((SELECT result FROM cron_runs WHERE jobSlug = j.slug ORDER BY startedAt DESC LIMIT 1), '-') AS last_result,
      COALESCE((SELECT startedAt FROM cron_runs WHERE jobSlug = j.slug ORDER BY startedAt DESC LIMIT 1), '-') AS last_run
    FROM cron_jobs j
    ORDER BY j.name
  `).all();
} finally {
  db.close();
}

console.log('JOBURI:');
console.log('---');

if (!jobs || jobs.length === 0) {
  console.log('  (niciun job in DB)');
  console.log('');
  console.log('Adauga: din dashboard (tab Schedule) sau prin fisier JSON in cron/jobs/');
  process.exit(0);
}

for (const j of jobs) {
  const icon = j.active ? 'ON ' : 'OFF';
  const name = (j.name || j.slug || '').padEnd(25);
  const schedule = (j.schedule || '').padEnd(15);
  console.log(`  [${icon}] ${name}  schedule: ${schedule}  ultima: ${j.last_result} (${j.last_run})`);
}

console.log('');
console.log(`Total: ${jobs.length} job(uri)`);
