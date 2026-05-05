import http from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, extname, resolve, sep } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import { listTasks, createTask, getTask, updateTask, deleteTask } from './api/tasks.js';
import { listJobs, createJob, updateJob, deleteJob, triggerRun, getHistory, getRunLog, getStatus as getCronStatus } from './api/cron.js';
import { listSkills, listCatalog } from './api/skills.js';
import { getAuditHistory, listMemory, getMemoryFile, saveMemoryFile, getLearnings, getConnectionHealth, runSkill } from './api/system.js';
import { listFiles, readFile } from './api/files.js';
import { getEnv, setEnv, getMcp, setMcp } from './api/settings.js';
import { getSummary, getHealth } from './api/dashboard.js';
import { listClients } from './api/clients.js';
import { handleSse } from './api/events.js';
import { getSkillStats, getCostBreakdown, getQualityStats } from './api/analytics.js';
import { closeDb } from './lib/db.js';
import { startScheduler, stopScheduler } from './lib/cron-scheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DIST_DIR = join(__dirname, 'dist');
const PORT = parseInt(process.env.PORT || '3001', 10);

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain',
};

/**
 * Parse URL query string into an object.
 */
function parseQuery(urlStr) {
  const url = new URL(urlStr, 'http://localhost');
  const params = {};
  for (const [key, value] of url.searchParams) {
    params[key] = value;
  }
  return { pathname: url.pathname, query: params };
}

/**
 * Read the request body as JSON.
 */
const MAX_BODY_SIZE = 1024 * 1024; // 1MB

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalSize = 0;
    req.on('data', chunk => {
      totalSize += chunk.length;
      if (totalSize > MAX_BODY_SIZE) {
        req.destroy();
        return reject(new Error('Request body too large'));
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString();
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

/**
 * Send JSON response.
 */
function json(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
  });
  res.end(JSON.stringify(data));
}

/**
 * Send error response.
 */
function error(res, message, status = 500) {
  json(res, { error: message }, status);
}

/**
 * Serve a static file from the dist directory.
 */
function serveStatic(res, filePath) {
  if (!existsSync(filePath)) return false;

  try {
    const stat = statSync(filePath);
    if (!stat.isFile()) return false;

    const ext = extname(filePath);
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    const content = readFileSync(filePath);

    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': content.length,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    });
    res.end(content);
    return true;
  } catch {
    return false;
  }
}

/**
 * Route API requests.
 */
async function handleApi(req, res, pathname, query) {
  const method = req.method;

  try {
    // Tasks
    if (pathname === '/api/tasks' && method === 'GET') {
      return json(res, listTasks(query));
    }
    if (pathname === '/api/tasks' && method === 'POST') {
      const body = await readBody(req);
      return json(res, createTask(body), 201);
    }

    const taskMatch = pathname.match(/^\/api\/tasks\/([^/]+)$/);
    if (taskMatch) {
      const id = taskMatch[1];
      if (method === 'GET') {
        const task = getTask(id);
        return task ? json(res, task) : error(res, 'Not found', 404);
      }
      if (method === 'PATCH') {
        const body = await readBody(req);
        const updated = updateTask(id, body);
        return updated ? json(res, updated) : error(res, 'Not found', 404);
      }
      if (method === 'DELETE') {
        return deleteTask(id) ? json(res, { ok: true }) : error(res, 'Not found', 404);
      }
    }

    // Cron
    if (pathname === '/api/cron' && method === 'GET') {
      return json(res, listJobs(query));
    }
    if (pathname === '/api/cron' && method === 'POST') {
      const body = await readBody(req);
      return json(res, createJob(body), 201);
    }
    if (pathname === '/api/cron/status' && method === 'GET') {
      return json(res, getCronStatus());
    }

    const cronRunMatch = pathname.match(/^\/api\/cron\/([^/]+)\/run$/);
    if (cronRunMatch && method === 'POST') {
      const run = await triggerRun(cronRunMatch[1]);
      return run ? json(res, run, 201) : error(res, 'Job not found', 404);
    }

    const cronHistoryMatch = pathname.match(/^\/api\/cron\/([^/]+)\/history$/);
    if (cronHistoryMatch && method === 'GET') {
      return json(res, getHistory(cronHistoryMatch[1]));
    }

    const cronLogMatch = pathname.match(/^\/api\/cron\/([^/]+)\/runs\/(\d+)\/log$/);
    if (cronLogMatch && method === 'GET') {
      const slug = cronLogMatch[1];
      const runId = parseInt(cronLogMatch[2], 10);
      const data = getRunLog(slug, runId);
      return data ? json(res, data) : error(res, 'Run not found', 404);
    }

    const cronSlugMatch = pathname.match(/^\/api\/cron\/([^/]+)$/);
    if (cronSlugMatch && method === 'PATCH') {
      const body = await readBody(req);
      const updated = updateJob(cronSlugMatch[1], body);
      return updated ? json(res, updated) : error(res, 'Not found', 404);
    }
    if (cronSlugMatch && method === 'DELETE') {
      const ok = deleteJob(cronSlugMatch[1]);
      return ok ? json(res, { ok: true }) : error(res, 'Not found', 404);
    }

    // Skills
    if (pathname === '/api/skills' && method === 'GET') {
      return json(res, listSkills());
    }
    if (pathname === '/api/skills/catalog' && method === 'GET') {
      return json(res, listCatalog());
    }

    const skillRunMatch = pathname.match(/^\/api\/skills\/([^/]+)\/run$/);
    if (skillRunMatch && method === 'POST') {
      const body = await readBody(req);
      const result = runSkill(skillRunMatch[1], body);
      return result ? json(res, result, 202) : error(res, 'Skill not found', 404);
    }

    // System (audit history, memory, learnings, connection health)
    if (pathname === '/api/system/audit-history' && method === 'GET') {
      return json(res, getAuditHistory());
    }
    if (pathname === '/api/system/memory' && method === 'GET') {
      return json(res, listMemory());
    }
    const memoryMatch = pathname.match(/^\/api\/system\/memory\/(\d{4}-\d{2}-\d{2})$/);
    if (memoryMatch && method === 'GET') {
      const data = getMemoryFile(memoryMatch[1]);
      return data ? json(res, data) : error(res, 'Not found', 404);
    }
    if (memoryMatch && method === 'PUT') {
      const body = await readBody(req);
      return json(res, saveMemoryFile(memoryMatch[1], body.content || ''));
    }
    if (pathname === '/api/system/learnings' && method === 'GET') {
      return json(res, getLearnings());
    }
    if (pathname === '/api/system/connections-health' && method === 'GET') {
      return json(res, await getConnectionHealth());
    }

    // Files
    if (pathname === '/api/files' && method === 'GET') {
      if (query.path) {
        const data = readFile(query.path);
        return data ? json(res, data) : error(res, 'Not found', 404);
      }
      return json(res, listFiles());
    }

    // Settings
    if (pathname === '/api/settings/env' && method === 'GET') {
      return json(res, getEnv());
    }
    if (pathname === '/api/settings/env' && method === 'PUT') {
      const body = await readBody(req);
      setEnv(body);
      return json(res, { ok: true });
    }
    if (pathname === '/api/settings/mcp' && method === 'GET') {
      return json(res, getMcp());
    }
    if (pathname === '/api/settings/mcp' && method === 'PUT') {
      const body = await readBody(req);
      setMcp(body);
      return json(res, { ok: true });
    }

    // Dashboard
    if (pathname === '/api/dashboard/summary' && method === 'GET') {
      return json(res, getSummary());
    }
    if (pathname === '/api/dashboard/health' && method === 'GET') {
      return json(res, getHealth());
    }

    // Clients
    if (pathname === '/api/clients' && method === 'GET') {
      return json(res, listClients());
    }

    // Analytics
    if (pathname === '/api/analytics/skills' && method === 'GET') {
      return json(res, getSkillStats());
    }
    if (pathname === '/api/analytics/costs' && method === 'GET') {
      return json(res, getCostBreakdown());
    }
    if (pathname === '/api/analytics/quality' && method === 'GET') {
      return json(res, getQualityStats());
    }

    // SSE Events
    if (pathname === '/api/events' && method === 'GET') {
      return handleSse(req, res);
    }

    return error(res, 'Not found', 404);
  } catch (e) {
    const status = e.statusCode || 500;
    if (status >= 500) console.error(`API error [${method} ${pathname}]:`, e.message);
    return error(res, e.message, status);
  }
}

/**
 * Main request handler.
 */
async function handler(req, res) {
  // CORS: only allow same-origin (dashboard is served from same host)
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const { pathname, query } = parseQuery(req.url || '/');

  // API routes
  if (pathname.startsWith('/api/')) {
    return handleApi(req, res, pathname, query);
  }

  // Static file serving from dist/
  if (existsSync(DIST_DIR)) {
    const safePath = (p) => {
      const resolved = resolve(DIST_DIR, p.replace(/^\/+/, ''));
      return resolved.startsWith(DIST_DIR + sep) || resolved === DIST_DIR ? resolved : null;
    };

    let filePath = safePath(pathname);
    if (filePath && serveStatic(res, filePath)) return;

    if (!extname(pathname)) {
      filePath = safePath(pathname + '/index.html');
      if (filePath && serveStatic(res, filePath)) return;

      filePath = safePath(pathname + '.html');
      if (filePath && serveStatic(res, filePath)) return;
    }

    // Fallback to index.html
    filePath = join(DIST_DIR, 'index.html');
    if (serveStatic(res, filePath)) return;
  }

  error(res, 'Not found. Run "npm run build" first.', 404);
}

// Create and start server
const server = http.createServer(handler);

server.listen(PORT, () => {
  console.log(`robOS Centre ruleaza la http://localhost:${PORT}`);
  // Pornim scheduler-ul cron in-process (inlocuieste cron-daemon.js)
  try {
    startScheduler();
  } catch (e) {
    console.error('Scheduler n-a pornit:', e.message);
  }
});

// Graceful shutdown
function shutdown() {
  console.log('\nInchidere...');
  try { stopScheduler(); } catch { /* ignore */ }
  server.close(() => {
    closeDb();
    process.exit(0);
  });
  // Force exit dupa 5s
  setTimeout(() => process.exit(1), 5000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
