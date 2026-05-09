/**
 * cron-runner.js
 *
 * Helper partajat pentru executia joburilor cron. Folosit de:
 *  - cron-scheduler.js (rulari programate)
 *  - api/cron.js (Run Now manual)
 *
 * Responsabilitati:
 *  - Spawn Claude CLI cu argumentele potrivite
 *  - Inregistreaza inceput/sfarsit in cron_runs
 *  - Salveaza output in fisier de log
 *  - Emite evenimente SSE (cron:run:started, cron:run:completed)
 *  - Aplica retry policy
 *  - Schimba cwd pentru joburi de client
 */

import { spawn } from 'child_process';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { workspaceRoot } from './config.js';
import { getDb } from './db.js';
import { emit } from './event-bus.js';
import { notify, isSilentOutput } from './notify.js';

/**
 * Parse a command string into argv array. Handles double-quoted segments.
 * Used for `command`-mode cron jobs to avoid shell:true (S4 fix).
 *
 * Examples:
 *   "node scripts/foo.js"           → ["node", "scripts/foo.js"]
 *   "node scripts/foo.js --flag"    → ["node", "scripts/foo.js", "--flag"]
 *   'node "path with spaces.js" -q' → ["node", "path with spaces.js", "-q"]
 *
 * Does NOT support shell features (&&, |, >, $VAR). If a job needs those,
 * convert to a script and call that script instead.
 */
function parseCommandArgv(commandStr) {
  const tokens = [];
  let i = 0;
  const s = commandStr.trim();
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i >= s.length) break;
    let token = '';
    if (s[i] === '"') {
      i++;
      while (i < s.length && s[i] !== '"') token += s[i++];
      if (s[i] === '"') i++;
    } else {
      while (i < s.length && !/\s/.test(s[i])) token += s[i++];
    }
    tokens.push(token);
  }
  return tokens;
}

const LOGS_DIR = join(workspaceRoot, 'cron', 'logs');
const MAX_CONCURRENT = 3;
let running = 0;

/**
 * Parseaza un timeout string ("30s", "5m", "1h") in milisecunde.
 */
export function parseTimeout(str) {
  const match = str?.match(/^(\d+)(s|m|h)$/);
  if (!match) return 30 * 60 * 1000;
  const val = parseInt(match[1]);
  switch (match[2]) {
    case 's': return val * 1000;
    case 'm': return val * 60 * 1000;
    case 'h': return val * 3600 * 1000;
    default: return 30 * 60 * 1000;
  }
}

/**
 * Determina cwd-ul pentru un job.
 * - Daca job.clientId exista si exista clients/{clientId}/, folosim acela
 * - Altfel folosim workspace root
 */
function resolveCwd(job) {
  if (job.clientId) {
    const clientDir = join(workspaceRoot, 'clients', job.clientId);
    if (existsSync(clientDir)) return clientDir;
  }
  return workspaceRoot;
}

/**
 * Executa un job. Returneaza Promise care se rezolva la finalizare.
 *
 * @param {object} job - rand din cron_jobs
 * @param {object} opts
 * @param {'scheduled'|'manual'|'retry'} opts.trigger
 * @param {number} opts.attempt - 1-based
 */
export async function executeJob(job, { trigger = 'scheduled', attempt = 1 } = {}) {
  if (running >= MAX_CONCURRENT) {
    console.warn(`[cron-runner] SKIP ${job.slug}: max concurrent (${MAX_CONCURRENT}) atins`);
    return null;
  }

  running++;
  const startTime = Date.now();
  const startedAt = new Date().toISOString();

  // Inregistreaza pornirea
  let runId = null;
  try {
    const db = getDb();
    const result = db.prepare(`
      INSERT INTO cron_runs (jobSlug, trigger, result, startedAt)
      VALUES (?, ?, 'running', ?)
    `).run(job.slug, trigger, startedAt);
    runId = result.lastInsertRowid;
  } catch (e) {
    console.error(`[cron-runner] nu am putut inregistra start pentru ${job.slug}:`, e.message);
    running--;
    return null;
  }

  emit('cron:run:started', { slug: job.slug, runId, trigger, startedAt });

  const cwd = resolveCwd(job);

  // Mod 1: command direct (deterministic, bypass Claude). Folosit pentru audituri (audit-startup, session-timeout, learnings-aggregator).
  // Mod 2 (default): claude -p {prompt} prin shell.
  const useDirectCommand = job.command && typeof job.command === 'string' && job.command.trim();
  let spawnCmd, spawnArgs, spawnOpts;

  if (useDirectCommand) {
    // S4 fix: parse command into argv + spawn shell:false. shell:true was a
    // defense-in-depth gap — cron/defaults/*.json could be subverted by a
    // malicious skill writing a job with shell metacharacters.
    const argv = parseCommandArgv(job.command);
    if (argv.length === 0) {
      console.error(`[cron-runner] empty command pentru ${job.slug}`);
      running--;
      return null;
    }
    // Cross-platform: when invoking node, use process.execPath instead of
    // resolving 'node' through PATH. Avoids Windows .cmd shim issues with
    // shell:false (e.g. nvm-windows) and is more deterministic.
    spawnCmd = argv[0] === 'node' ? process.execPath : argv[0];
    spawnArgs = argv.slice(1);
    spawnOpts = {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
      shell: false,
    };
  } else {
    spawnCmd = 'claude';
    spawnArgs = ['-p', job.prompt];
    if (job.model) spawnArgs.unshift('--model', job.model);
    spawnOpts = {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
      shell: process.platform === 'win32',
    };
  }

  const mode = useDirectCommand ? 'cmd' : 'claude';
  console.log(`[cron-runner] RUN ${job.slug} (run #${runId}, mode=${mode}, trigger=${trigger}, attempt=${attempt}, cwd=${cwd})`);

  return new Promise((resolve) => {
    const child = spawn(spawnCmd, spawnArgs, spawnOpts);

    let output = '';
    let timedOut = false;
    child.stdout?.on('data', d => { output += d.toString(); });
    child.stderr?.on('data', d => { output += d.toString(); });

    const timeoutMs = parseTimeout(job.timeout || '30m');
    const timer = setTimeout(() => {
      if (!child.killed) {
        timedOut = true;
        try { child.kill('SIGTERM'); } catch { /* ignore */ }
        console.warn(`[cron-runner] TIMEOUT ${job.slug} dupa ${job.timeout || '30m'}`);
      }
    }, timeoutMs);

    child.on('close', async (code) => {
      clearTimeout(timer);
      running--;

      const durationSec = (Date.now() - startTime) / 1000;
      const result = timedOut ? 'timeout' : (code === 0 ? 'success' : 'failure');
      const completedAt = new Date().toISOString();

      // Salveaza output in fisier
      let logFile = null;
      try {
        mkdirSync(LOGS_DIR, { recursive: true });
        logFile = join(LOGS_DIR, `${job.slug}-${runId}.log`);
        writeFileSync(logFile, output, 'utf-8');
      } catch (e) {
        console.error(`[cron-runner] nu am putut scrie log pentru ${job.slug}:`, e.message);
      }

      // Inchide rand-ul cron_runs
      try {
        const db = getDb();
        db.prepare(`
          UPDATE cron_runs
          SET result = ?, completedAt = ?, durationSec = ?, exitCode = ?
          WHERE id = ?
        `).run(result, completedAt, durationSec, code, runId);
      } catch (e) {
        console.error(`[cron-runner] nu am putut inchide run ${runId}:`, e.message);
      }

      console.log(`[cron-runner] DONE ${job.slug} (${result}, ${durationSec.toFixed(1)}s, exit ${code})`);

      // Smart silence: jobs care produc [SILENT] in output suprima notification.
      // Util pentru monitoring jobs care raporteaza "all clear" — nu deranjam operatorul.
      // Failure-urile NU se suprima, indiferent de [SILENT] (siguranta).
      const silent = isSilentOutput(output);
      const notifyMode = job.notify || 'on_finish';
      const shouldNotify = (() => {
        if (notifyMode === 'silent') return false;
        if (result === 'failure' || result === 'timeout') {
          return notifyMode === 'on_finish' || notifyMode === 'on_failure';
        }
        // success
        if (silent) return false;
        return notifyMode === 'on_finish';
      })();

      if (shouldNotify) {
        const title = result === 'success' ? `robOS: ${job.slug} done` : `robOS: ${job.slug} ${result}`;
        const msg = result === 'success'
          ? `Completed in ${durationSec.toFixed(1)}s`
          : `Job ended with ${result} (exit ${code})`;
        notify({ title, message: msg, type: result === 'success' ? 'success' : 'failure' }).catch(() => {});
      }

      emit('cron:run:completed', {
        slug: job.slug,
        runId,
        result,
        durationSec,
        exitCode: code,
        attempt,
        silent,
        notified: shouldNotify,
      });

      // Retry policy
      const maxRetries = job.retries || 0;
      const shouldRetry = (result === 'failure' || result === 'timeout')
        && attempt <= maxRetries
        && trigger !== 'manual';

      if (shouldRetry) {
        const backoffMs = Math.min(30_000 * Math.pow(4, attempt - 1), 8 * 60_000);
        console.log(`[cron-runner] RETRY ${job.slug} in ${backoffMs / 1000}s (attempt ${attempt + 1}/${maxRetries + 1})`);
        setTimeout(() => {
          executeJob(job, { trigger: 'retry', attempt: attempt + 1 }).catch(err => {
            console.error(`[cron-runner] retry esuat:`, err.message);
          });
        }, backoffMs);
      }

      resolve({ runId, result, durationSec, exitCode: code, logFile });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      running--;
      console.error(`[cron-runner] ERROR spawning claude pentru ${job.slug}:`, err.message);

      try {
        const db = getDb();
        db.prepare(`
          UPDATE cron_runs
          SET result = 'failure', completedAt = ?, durationSec = ?, exitCode = -1
          WHERE id = ?
        `).run(new Date().toISOString(), (Date.now() - startTime) / 1000, runId);
      } catch { /* ignore */ }

      emit('cron:run:completed', {
        slug: job.slug,
        runId,
        result: 'failure',
        error: err.message,
      });

      resolve({ runId, result: 'failure', error: err.message });
    });
  });
}

/**
 * Executa fara await — fire and forget. Util pentru API run-now ca sa raspunda imediat.
 */
export function executeJobAsync(job, opts) {
  executeJob(job, opts).catch(err => {
    console.error('[cron-runner] executeJobAsync esuat:', err.message);
  });
}
