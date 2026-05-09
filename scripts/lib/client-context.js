/**
 * client-context.js
 *
 * Single source of truth for the active-client mechanism.
 *
 * State file: data/active-client.json
 *   {
 *     "slug": "acme-corp",
 *     "name": "Acme Corp",
 *     "switched_at": "2026-05-08T08:00:00Z",
 *     "switched_from": null | "previous-slug"
 *   }
 *
 * When set, all skills/hooks resolve these paths from clients/{slug}/ instead of root:
 *   brand/*, context/USER.md, context/learnings.md, context/memory/, projects/
 *
 * These STAY global regardless of active client:
 *   context/SOUL.md, skills/, data/* (DB, telemetry, activity log)
 *
 * Auto-clear behavior: if the state references a slug whose folder no longer
 * exists on disk, getActiveClient() clears state and returns null. This keeps
 * the system self-healing without requiring manual cleanup after a client is
 * deleted from disk.
 */

import { readFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { atomicWrite } from './atomic-write.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROBOS_ROOT = join(__dirname, '..', '..');
const STATE_FILE = join(ROBOS_ROOT, 'data', 'active-client.json');
const CLIENTS_DIR = join(ROBOS_ROOT, 'clients');

// Slug regex: lowercase alphanumeric with single-char dashes between, no leading/trailing dash.
// Matches add-client.sh validation exactly.
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

// atomicWrite extracted to scripts/lib/atomic-write.js (F4 fix — adds Windows
// EBUSY/EPERM retry + try/finally tmp cleanup). Imported above.

/**
 * Validate a slug against the canonical regex.
 * Returns true on valid, false otherwise. No throw — callers decide.
 */
export function isValidSlug(slug) {
  return typeof slug === 'string' && SLUG_RE.test(slug);
}

/**
 * Internal: read state file. Returns object or null.
 * Never throws on parse error — corrupt state is treated as "no active client".
 */
function readStateFile() {
  if (!existsSync(STATE_FILE)) return null;
  try {
    const data = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
    if (!data || typeof data !== 'object') return null;
    if (!isValidSlug(data.slug)) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Get the currently active client.
 *
 * Self-healing: if state points to a non-existent client folder, clears state
 * and returns null. This means dashboard, hooks, and skills never see
 * inconsistent state where slug is set but folder is gone.
 *
 * @returns {{slug: string, name: string, switched_at: string} | null}
 */
export function getActiveClient() {
  const state = readStateFile();
  if (!state) return null;

  const clientDir = join(CLIENTS_DIR, state.slug);
  if (!existsSync(clientDir)) {
    // Auto-clear stale state — folder deleted while we were inactive.
    try { unlinkSync(STATE_FILE); } catch { /* noop */ }
    return null;
  }
  return state;
}

/**
 * Switch to a client. Validates slug + folder existence.
 * Throws Error with actionable Romanian message on failure.
 *
 * @param {string} slug
 * @returns {{slug, name, switched_at, switched_from}}
 */
export function setActiveClient(slug) {
  if (!isValidSlug(slug)) {
    throw new Error(
      `Slug invalid: "${slug}". Foloseste lowercase, cifre si liniute (ex: acme-corp).`
    );
  }
  const clientDir = join(CLIENTS_DIR, slug);
  if (!existsSync(clientDir)) {
    const existing = listClients().map(c => c.slug);
    const list = existing.length > 0 ? existing.join(', ') : '(niciun client creat)';
    throw new Error(
      `Clientul "${slug}" nu exista. Clienti disponibili: ${list}. ` +
      `Pentru a crea un client nou: bash scripts/add-client.sh ${slug}`
    );
  }

  const previous = readStateFile();
  const switched_from = previous ? previous.slug : null;

  // Try to derive a friendly name from clients/{slug}/context/USER.md (Nume: line).
  let name = slug;
  try {
    const userMd = join(clientDir, 'context', 'USER.md');
    if (existsSync(userMd)) {
      const txt = readFileSync(userMd, 'utf-8');
      const match = txt.match(/^Nume:\s*(.+)$/m);
      if (match && match[1].trim()) name = match[1].trim();
    }
  } catch { /* fallback to slug */ }

  const state = {
    slug,
    name,
    switched_at: new Date().toISOString(),
    switched_from,
  };
  atomicWrite(STATE_FILE, JSON.stringify(state, null, 2));
  return state;
}

/**
 * Clear active client (back to root workspace).
 * Idempotent — calling when no state exists is a no-op.
 */
export function clearActiveClient() {
  const previous = readStateFile();
  if (existsSync(STATE_FILE)) {
    try { unlinkSync(STATE_FILE); } catch { /* noop */ }
  }
  return previous;
}

/**
 * List all clients on disk, with quick health flags.
 *
 * @returns {Array<{slug, name, has_brand, has_memory, has_user_md}>}
 */
export function listClients() {
  if (!existsSync(CLIENTS_DIR)) return [];

  const entries = readdirSync(CLIENTS_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('.'));

  return entries.map(e => {
    const slug = e.name;
    const dir = join(CLIENTS_DIR, slug);
    const userMd = join(dir, 'context', 'USER.md');
    const brandDir = join(dir, 'brand');
    const memoryDir = join(dir, 'context', 'memory');

    let name = slug;
    if (existsSync(userMd)) {
      try {
        const match = readFileSync(userMd, 'utf-8').match(/^Nume:\s*(.+)$/m);
        if (match && match[1].trim()) name = match[1].trim();
      } catch { /* keep slug */ }
    }

    return {
      slug,
      name,
      has_brand: existsSync(brandDir),
      has_memory: existsSync(memoryDir),
      has_user_md: existsSync(userMd),
    };
  });
}

/**
 * Resolve a relative path to its client-aware absolute location.
 * If a client is active AND the path is in the per-client scope, resolves
 * to clients/{slug}/{relPath}. Otherwise resolves to ROBOS_ROOT/{relPath}.
 *
 * Per-client scope (prefixes that route to client when active):
 *   brand/, context/USER.md, context/learnings.md, context/memory/, projects/
 *
 * Global (always root):
 *   context/SOUL.md, skills/, data/*, anything else
 *
 * @param {string} relPath  path relative to ROBOS_ROOT (forward slashes ok)
 * @returns {string} absolute path
 */
export function resolveContextPath(relPath) {
  if (typeof relPath !== 'string' || !relPath) return ROBOS_ROOT;
  const normalized = relPath.replace(/^[/\\]+/, '').replace(/\\/g, '/');

  const active = getActiveClient();
  if (active && isPerClientPath(normalized)) {
    return join(CLIENTS_DIR, active.slug, normalized);
  }
  return join(ROBOS_ROOT, normalized);
}

/**
 * @param {string} normalizedPath  forward-slash path, no leading slash
 */
function isPerClientPath(normalizedPath) {
  if (normalizedPath.startsWith('brand/')) return true;
  if (normalizedPath === 'brand') return true;
  if (normalizedPath === 'context/USER.md') return true;
  if (normalizedPath === 'context/learnings.md') return true;
  if (normalizedPath.startsWith('context/memory/')) return true;
  if (normalizedPath === 'context/memory') return true;
  if (normalizedPath.startsWith('projects/')) return true;
  if (normalizedPath === 'projects') return true;
  return false;
}

/**
 * Convenience: absolute path of memory dir for the active client (or root).
 */
export function getMemoryDir() {
  const active = getActiveClient();
  if (active) return join(CLIENTS_DIR, active.slug, 'context', 'memory');
  return join(ROBOS_ROOT, 'context', 'memory');
}

/**
 * Get ALL memory scopes (root + every client on disk).
 *
 * Use this when a tool needs to scan/audit memory across the whole project,
 * not just the active scope. Examples: session-timeout-detector (must see
 * ANY recent session, regardless of which client it ran in), audit-startup
 * (cross-scope abandoned-session detection).
 *
 * @returns {Array<{scope: 'root' | string, dir: string, label: string}>}
 *   scope = 'root' or client slug; dir = absolute path; label = human-readable.
 */
export function getAllMemoryScopes() {
  const scopes = [{
    scope: 'root',
    dir: join(ROBOS_ROOT, 'context', 'memory'),
    label: 'root',
  }];

  for (const client of listClients()) {
    scopes.push({
      scope: client.slug,
      dir: join(CLIENTS_DIR, client.slug, 'context', 'memory'),
      label: `client:${client.slug}`,
    });
  }

  return scopes;
}

/**
 * Convenience: absolute path of brand dir for the active client (or root).
 */
export function getBrandDir() {
  const active = getActiveClient();
  if (active) return join(CLIENTS_DIR, active.slug, 'brand');
  return join(ROBOS_ROOT, 'brand');
}

/**
 * Convenience: absolute path of projects dir for the active client (or root).
 */
export function getProjectsDir() {
  const active = getActiveClient();
  if (active) return join(CLIENTS_DIR, active.slug, 'projects');
  return join(ROBOS_ROOT, 'projects');
}

/**
 * Convenience: absolute path of ROBOS_ROOT, exposed for callers who need to
 * resolve paths outside the per-client scope (e.g. SOUL.md, skill index).
 */
export function getRobosRoot() {
  return ROBOS_ROOT;
}

/**
 * Convenience: absolute path of clients/ dir.
 */
export function getClientsDir() {
  return CLIENTS_DIR;
}
