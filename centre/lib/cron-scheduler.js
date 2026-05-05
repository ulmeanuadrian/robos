/**
 * cron-scheduler.js
 *
 * Scheduler in-process care ruleaza in interiorul server.js.
 * Citeste cron_jobs din DB, creaza instante croner, le re-incarca la fiecare 5 minute.
 *
 * Inlocuieste daemon-ul standalone (cron-daemon.js). Daemon-ul ramane doar
 * ca shim de backwards compat pentru `bash scripts/start-crons.sh`.
 */

import { Cron } from 'croner';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { workspaceRoot } from './config.js';
import { getDb } from './db.js';
import { executeJob } from './cron-runner.js';

const JOBS_DIR = join(workspaceRoot, 'cron', 'jobs');
const DEFAULTS_DIR = join(workspaceRoot, 'cron', 'defaults');

/** Map<slug, Cron> */
const activeCrons = new Map();
let reloadTimer = null;
let started = false;

/**
 * Migreaza cron/jobs/*.json in tabela cron_jobs (idempotent — sare peste slug-uri existente).
 */
function migrateJsonJobs() {
  if (!existsSync(JOBS_DIR)) return 0;

  const files = readdirSync(JOBS_DIR).filter(f => f.endsWith('.json'));
  if (files.length === 0) return 0;

  return importJobsFromDir(JOBS_DIR, 'MIGRAT', files);
}

/**
 * Migreaza default jobs livrate cu robOS din cron/defaults/ (idempotent).
 * Defaults sunt in git (cron/defaults/), user-create sunt in cron/jobs/ (gitignored).
 */
function migrateDefaultJobs() {
  if (!existsSync(DEFAULTS_DIR)) return 0;
  const files = readdirSync(DEFAULTS_DIR).filter(f => f.endsWith('.json'));
  if (files.length === 0) return 0;
  return importJobsFromDir(DEFAULTS_DIR, 'DEFAULT', files);
}

/**
 * Helper comun pentru import din director (sare peste slug-uri existente).
 */
function importJobsFromDir(dir, label, files) {
  const db = getDb();
  const existsStmt = db.prepare('SELECT 1 FROM cron_jobs WHERE slug = ?');
  const insertStmt = db.prepare(`
    INSERT INTO cron_jobs (slug, name, schedule, days, model, prompt, command, active, timeout, retries, notify, clientId)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let imported = 0;
  for (const file of files) {
    try {
      const raw = readFileSync(join(dir, file), 'utf-8');
      const job = JSON.parse(raw);
      const slug = job.slug || job.name || file.replace(/\.json$/, '');

      if (existsStmt.get(slug)) continue;

      const prompt = job.prompt || (job.skill
        ? `Run skill ${job.skill}${job.args ? ' with args: ' + JSON.stringify(job.args) : ''}`
        : (job.command ? `Direct command: ${job.command}` : `Run job: ${slug}`));

      insertStmt.run(
        slug,
        job.name || slug,
        job.schedule,
        job.days || 'daily',
        job.model || 'sonnet',
        prompt,
        job.command || null,
        job.enabled === false ? 0 : 1,
        job.timeout || '30m',
        job.retries || 0,
        job.notify || 'on_finish',
        job.clientId || null
      );
      imported++;
      console.log(`[scheduler] ${label}: ${slug} (din ${file})`);
    } catch (e) {
      console.warn(`[scheduler] WARN: nu am putut migra ${file}:`, e.message);
    }
  }
  return imported;
}

/**
 * Valideaza un schedule string folosind croner. Returneaza true daca e valid.
 */
export function isValidSchedule(schedule) {
  try {
    const c = new Cron(schedule, { paused: true }, () => {});
    c.stop();
    return true;
  } catch {
    return false;
  }
}

/**
 * Reincarca toate joburile din DB — opreste cele vechi, creeaza cele active.
 */
export function reloadJobs() {
  // Stop vechile
  for (const [, cron] of activeCrons) {
    try { cron.stop(); } catch { /* ignore */ }
  }
  activeCrons.clear();

  const db = getDb();
  const jobs = db.prepare('SELECT * FROM cron_jobs WHERE active = 1').all();
  let scheduled = 0;

  for (const job of jobs) {
    if (!job.schedule) {
      console.warn(`[scheduler] SKIP ${job.slug}: fara schedule`);
      continue;
    }

    if (!isValidSchedule(job.schedule)) {
      console.warn(`[scheduler] SKIP ${job.slug}: schedule invalid "${job.schedule}"`);
      continue;
    }

    try {
      const cron = new Cron(job.schedule, () => {
        executeJob(job, { trigger: 'scheduled' }).catch(err => {
          console.error(`[scheduler] eroare la executie:`, err.message);
        });
      });
      activeCrons.set(job.slug, cron);
      scheduled++;
    } catch (e) {
      console.warn(`[scheduler] ERROR ${job.slug}:`, e.message);
    }
  }

  console.log(`[scheduler] ${scheduled} job(uri) programat(e)`);
  return scheduled;
}

/**
 * Porneste scheduler-ul. Idempotent.
 */
export function startScheduler() {
  if (started) return;
  started = true;

  console.log('[scheduler] pornesc...');

  try {
    const defaultsMigrated = migrateDefaultJobs();
    if (defaultsMigrated > 0) console.log(`[scheduler] migrat ${defaultsMigrated} default job(uri)`);
    const userMigrated = migrateJsonJobs();
    if (userMigrated > 0) console.log(`[scheduler] migrat ${userMigrated} user job(uri) din JSON`);
  } catch (e) {
    console.warn('[scheduler] migrare JSON->DB esuata:', e.message);
  }

  reloadJobs();

  // Re-incarca la fiecare 5 minute (capteaza schimbari din UI)
  reloadTimer = setInterval(() => {
    reloadJobs();
  }, 5 * 60 * 1000);
}

/**
 * Opreste scheduler-ul (chemat la SIGTERM/SIGINT din server.js).
 */
export function stopScheduler() {
  if (!started) return;
  if (reloadTimer) {
    clearInterval(reloadTimer);
    reloadTimer = null;
  }
  for (const [, cron] of activeCrons) {
    try { cron.stop(); } catch { /* ignore */ }
  }
  activeCrons.clear();
  started = false;
  console.log('[scheduler] oprit');
}

/**
 * Status pentru API — cate joburi sunt programate, urmatoarele rulari.
 */
export function getStatus() {
  const result = [];
  for (const [slug, cron] of activeCrons) {
    try {
      result.push({
        slug,
        next_run: cron.nextRun()?.toISOString() || null,
      });
    } catch {
      result.push({ slug, next_run: null });
    }
  }
  return {
    started,
    job_count: activeCrons.size,
    jobs: result,
  };
}
