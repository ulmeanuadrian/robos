// Clients API — wraps the canonical scripts/lib/client-context.js so the
// dashboard, CLI, hooks, and skills all share ONE source of truth.
//
// Endpoints:
//   GET  /api/clients         → list with active flag + has_brand/has_memory
//   GET  /api/clients/active  → current active client (or { active: null })
//   PUT  /api/clients/active  → switch active client; body: { slug }
//                                slug: '' | null | 'root' clears active
//
// Note: PUT requires Bearer auth (see server.js AUTH_REQUIRED).

import {
  listClients as libListClients,
  getActiveClient,
  setActiveClient,
  clearActiveClient,
  isValidSlug,
} from '../../scripts/lib/client-context.js';

/**
 * GET /api/clients — list all client folders with health + active flag.
 * Backwards-compatible: also accepts `_metadata.json` for clients NOT created
 * by add-client.sh (manual setups).
 */
export function listClients() {
  const clients = libListClients();
  const active = getActiveClient();
  const activeSlug = active ? active.slug : null;
  return clients.map(c => ({
    slug: c.slug,
    name: c.name,
    has_brand: c.has_brand,
    has_memory: c.has_memory,
    has_user_md: c.has_user_md,
    active: c.slug === activeSlug,
  }));
}

/**
 * GET /api/clients/active — return the currently active client, or null.
 */
export function getActive() {
  const active = getActiveClient();
  return { active: active || null };
}

/**
 * PUT /api/clients/active — switch active client.
 * Body: { slug: 'acme-corp' } to set, { slug: null } | { slug: '' } | { slug: 'root' } to clear.
 *
 * Throws { statusCode } on validation/missing-client errors so server.js can
 * map to the right HTTP code.
 */
export function setActive(body) {
  const slug = body?.slug;
  // Clear sentinel values
  if (slug === null || slug === undefined || slug === '' || slug === 'root') {
    const previous = clearActiveClient();
    return { active: null, cleared: true, previous: previous?.slug || null };
  }
  if (typeof slug !== 'string' || !isValidSlug(slug)) {
    const err = new Error('slug invalid (foloseste lowercase, cifre si liniute)');
    err.statusCode = 400;
    throw err;
  }
  try {
    const result = setActiveClient(slug);
    return { active: result };
  } catch (e) {
    const err = new Error(e.message);
    err.statusCode = 404;
    throw err;
  }
}
