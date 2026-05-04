import { getDb } from '../lib/db.js';
import { emit } from '../lib/event-bus.js';

/**
 * GET /api/cron — list all cron jobs with their latest run
 */
export function listJobs(query = {}) {
  const db = getDb();
  let sql = 'SELECT * FROM cron_jobs';
  const params = [];

  if (query.clientId) {
    sql += ' WHERE clientId = ?';
    params.push(query.clientId);
  }

  sql += ' ORDER BY name ASC';
  const jobs = db.prepare(sql).all(...params);

  return jobs.map(job => {
    const lastRun = db.prepare(`
      SELECT * FROM cron_runs WHERE jobSlug = ? ORDER BY startedAt DESC LIMIT 1
    `).get(job.slug);

    return { ...job, lastRun: lastRun || null };
  });
}

/**
 * POST /api/cron — create a new cron job
 */
export function createJob(body) {
  const db = getDb();

  const stmt = db.prepare(`
    INSERT INTO cron_jobs (slug, name, schedule, days, model, prompt, active, timeout, retries, notify, clientId, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  stmt.run(
    body.slug,
    body.name || body.slug,
    body.schedule,
    body.days || 'daily',
    body.model || 'sonnet',
    body.prompt,
    body.active !== undefined ? body.active : 1,
    body.timeout || '30m',
    body.retries || 0,
    body.notify || 'on_finish',
    body.clientId || null
  );

  return db.prepare('SELECT * FROM cron_jobs WHERE slug = ?').get(body.slug);
}

/**
 * PATCH /api/cron/:slug — update a cron job
 */
export function updateJob(slug, body) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM cron_jobs WHERE slug = ?').get(slug);
  if (!existing) return null;

  const fields = [];
  const params = [];

  const allowedFields = ['name', 'schedule', 'days', 'model', 'prompt', 'active', 'timeout', 'retries', 'notify', 'clientId'];

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      fields.push(`${field} = ?`);
      params.push(body[field]);
    }
  }

  if (fields.length === 0) return existing;

  params.push(slug);
  db.prepare(`UPDATE cron_jobs SET ${fields.join(', ')} WHERE slug = ?`).run(...params);

  return db.prepare('SELECT * FROM cron_jobs WHERE slug = ?').get(slug);
}

/**
 * POST /api/cron/:slug/run — trigger a manual run
 */
export function triggerRun(slug) {
  const db = getDb();
  const job = db.prepare('SELECT * FROM cron_jobs WHERE slug = ?').get(slug);
  if (!job) return null;

  const now = new Date().toISOString();
  const result = db.prepare(`
    INSERT INTO cron_runs (jobSlug, trigger, result, startedAt)
    VALUES (?, 'manual', 'running', ?)
  `).run(slug, now);

  const run = db.prepare('SELECT * FROM cron_runs WHERE id = ?').get(result.lastInsertRowid);
  emit('cron:run:started', { slug, runId: run.id });
  return run;
}

/**
 * GET /api/cron/:slug/history — get run history for a job
 */
export function getHistory(slug, limit = 20) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM cron_runs WHERE jobSlug = ? ORDER BY startedAt DESC LIMIT ?
  `).all(slug, limit);
}
