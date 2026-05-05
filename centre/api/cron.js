import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { workspaceRoot } from '../lib/config.js';
import { getDb } from '../lib/db.js';
import { executeJobAsync } from '../lib/cron-runner.js';
import { isValidSchedule, reloadJobs, getStatus as getSchedulerStatus } from '../lib/cron-scheduler.js';

const LOGS_DIR = join(workspaceRoot, 'cron', 'logs');

const SLUG_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

function validateJobInput(body, { partial = false } = {}) {
  const errors = [];

  if (!partial || body.slug !== undefined) {
    if (!body.slug || !SLUG_RE.test(body.slug)) {
      errors.push('slug: trebuie lowercase, cifre si liniute (ex: daily-blog)');
    }
  }

  if (!partial || body.schedule !== undefined) {
    if (!body.schedule) {
      errors.push('schedule: obligatoriu (ex: "0 9 * * 1-5")');
    } else if (!isValidSchedule(body.schedule)) {
      errors.push(`schedule: format cron invalid "${body.schedule}"`);
    }
  }

  // prompt e obligatoriu doar daca command nu e prezent (jobs cu command bypassuiesc Claude)
  const hasCommand = body.command && typeof body.command === 'string' && body.command.trim().length >= 3;
  if (!partial || body.prompt !== undefined) {
    if (!hasCommand) {
      if (!body.prompt || typeof body.prompt !== 'string' || body.prompt.trim().length < 3) {
        errors.push('prompt: trebuie text >= 3 caractere (sau seteaza command pentru jobs deterministe)');
      }
    }
  }

  if (body.command !== undefined && body.command !== null && body.command !== '') {
    if (typeof body.command !== 'string' || body.command.trim().length < 3) {
      errors.push('command: trebuie text >= 3 caractere daca e setat');
    }
  }

  if (body.timeout !== undefined && body.timeout !== null) {
    if (!/^\d+(s|m|h)$/.test(body.timeout)) {
      errors.push('timeout: format invalid (foloseste 30s, 5m, 1h)');
    }
  }

  if (body.retries !== undefined && body.retries !== null) {
    if (!Number.isInteger(body.retries) || body.retries < 0 || body.retries > 5) {
      errors.push('retries: numar intreg 0-5');
    }
  }

  return errors;
}

/**
 * GET /api/cron — listeaza toate joburile cu ultima rulare
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
 * POST /api/cron — creeaza un job nou (cu validare)
 */
export function createJob(body) {
  const errors = validateJobInput(body);
  if (errors.length > 0) {
    const err = new Error('Validare esuata: ' + errors.join('; '));
    err.statusCode = 400;
    throw err;
  }

  const db = getDb();

  // Verifica unicitate slug
  const existing = db.prepare('SELECT 1 FROM cron_jobs WHERE slug = ?').get(body.slug);
  if (existing) {
    const err = new Error(`Slug "${body.slug}" deja exista`);
    err.statusCode = 409;
    throw err;
  }

  const stmt = db.prepare(`
    INSERT INTO cron_jobs (slug, name, schedule, days, model, prompt, command, active, timeout, retries, notify, clientId, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  // Daca command e setat dar prompt nu, generam un placeholder pentru prompt (nu poate fi NULL conform schema)
  const promptValue = body.prompt || (body.command ? `Direct command: ${body.command}` : null);

  stmt.run(
    body.slug,
    body.name || body.slug,
    body.schedule,
    body.days || 'daily',
    body.model || 'sonnet',
    promptValue,
    body.command || null,
    body.active !== undefined ? (body.active ? 1 : 0) : 1,
    body.timeout || '30m',
    body.retries || 0,
    body.notify || 'on_finish',
    body.clientId || null
  );

  // Reincarca scheduler-ul ca sa puna jobul nou in actiune
  try { reloadJobs(); } catch { /* ignore */ }

  return db.prepare('SELECT * FROM cron_jobs WHERE slug = ?').get(body.slug);
}

/**
 * PATCH /api/cron/:slug — actualizeaza un job
 */
export function updateJob(slug, body) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM cron_jobs WHERE slug = ?').get(slug);
  if (!existing) return null;

  const errors = validateJobInput(body, { partial: true });
  if (errors.length > 0) {
    const err = new Error('Validare esuata: ' + errors.join('; '));
    err.statusCode = 400;
    throw err;
  }

  const fields = [];
  const params = [];

  const allowedFields = ['name', 'schedule', 'days', 'model', 'prompt', 'command', 'active', 'timeout', 'retries', 'notify', 'clientId'];

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      fields.push(`${field} = ?`);
      // Coerce active to 0/1
      if (field === 'active') {
        params.push(body[field] ? 1 : 0);
      } else {
        params.push(body[field]);
      }
    }
  }

  if (fields.length === 0) return existing;

  params.push(slug);
  db.prepare(`UPDATE cron_jobs SET ${fields.join(', ')} WHERE slug = ?`).run(...params);

  // Reincarca scheduler-ul
  try { reloadJobs(); } catch { /* ignore */ }

  return db.prepare('SELECT * FROM cron_jobs WHERE slug = ?').get(slug);
}

/**
 * DELETE /api/cron/:slug — sterge un job (si run-urile lui sunt sterse cu ON DELETE CASCADE? Nu — cron_runs are doar REFERENCES)
 */
export function deleteJob(slug) {
  const db = getDb();
  const existing = db.prepare('SELECT 1 FROM cron_jobs WHERE slug = ?').get(slug);
  if (!existing) return false;

  // Stergem manual run-urile asociate (schema nu are CASCADE)
  db.prepare('DELETE FROM cron_runs WHERE jobSlug = ?').run(slug);
  db.prepare('DELETE FROM cron_jobs WHERE slug = ?').run(slug);

  // Reincarca scheduler-ul
  try { reloadJobs(); } catch { /* ignore */ }

  return true;
}

/**
 * POST /api/cron/:slug/run — declanseaza manual o rulare
 *
 * Insereaza randul cron_runs SI lanseaza efectiv claude CLI in background.
 * Raspunde imediat cu run-ul (cu result='running').
 */
export function triggerRun(slug) {
  const db = getDb();
  const job = db.prepare('SELECT * FROM cron_jobs WHERE slug = ?').get(slug);
  if (!job) return null;

  // Lanseaza fire-and-forget — runner-ul scrie cron_runs si emite evenimente
  executeJobAsync(job, { trigger: 'manual', attempt: 1 });

  // Returnam un placeholder: ultimul run pentru acest slug (cel pe care tocmai l-am inserat)
  // Mic delay de race-condition: runner-ul a inserat deja sincron in INSERT
  // (vezi cron-runner.js: insert se face inainte de spawn).
  // Asteptam tick-ul evenimentului.
  return new Promise((resolve) => {
    // Polling scurt — max 500ms — pentru run-ul nou inserat
    let attempts = 0;
    const tick = () => {
      const run = db.prepare(`
        SELECT * FROM cron_runs WHERE jobSlug = ? AND trigger = 'manual'
        ORDER BY startedAt DESC LIMIT 1
      `).get(slug);
      if (run && (Date.now() - new Date(run.startedAt).getTime()) < 5000) {
        return resolve(run);
      }
      if (attempts++ > 50) return resolve(null);
      setTimeout(tick, 10);
    };
    tick();
  });
}

/**
 * GET /api/cron/:slug/history — istoricul rularilor
 */
export function getHistory(slug, limit = 20) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM cron_runs WHERE jobSlug = ? ORDER BY startedAt DESC LIMIT ?
  `).all(slug, limit);
}

/**
 * GET /api/cron/:slug/runs/:runId/log — citeste log-ul unui run specific
 */
export function getRunLog(slug, runId) {
  const db = getDb();
  const run = db.prepare('SELECT * FROM cron_runs WHERE id = ? AND jobSlug = ?').get(runId, slug);
  if (!run) return null;

  const logFile = join(LOGS_DIR, `${slug}-${runId}.log`);
  if (!existsSync(logFile)) {
    return { run, log: '(fisierul de log nu mai exista)', missing: true };
  }

  try {
    const log = readFileSync(logFile, 'utf-8');
    // Trunchiem la 200KB pentru a nu inunda dashboard-ul
    const MAX = 200 * 1024;
    if (log.length > MAX) {
      return { run, log: log.slice(-MAX), truncated: true, full_size: log.length };
    }
    return { run, log };
  } catch (e) {
    return { run, log: `(eroare la citire: ${e.message})`, error: true };
  }
}

/**
 * GET /api/cron/status — status scheduler (cate joburi sunt active, urmatoarele rulari)
 */
export function getStatus() {
  return getSchedulerStatus();
}
