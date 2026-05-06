// Admin dashboard endpoints — Bearer token auth (simplu, zero email).
//
// Flow:
//   1. Adrian salveaza bookmark: https://admin.robos.vip/?token=XXX
//   2. Click bookmark → /auth?token=XXX seteaza cookie 24h → redirect /
//   3. Cookie-ul autentifica /admin/api/* timp de 24h
//   4. Dupa 24h, click bookmark din nou (cookie nou)

import {
  json,
  error,
  readJson,
  clientIp,
  userAgent,
  parseCookies,
  setCookieHeader,
} from '../lib/http.js';
import {
  createSession,
  getSession,
  deleteSession,
  listLicenses,
  getLicense,
  getActiveBindsForLicense,
  getEventsForLicense,
  revokeLicense,
  getStats,
  logEvent,
  createLicense,
  createDownloadToken,
} from '../lib/d1.js';
import {
  generateRandomToken,
  generateLicenseId,
  generateShortId,
} from '../lib/hardware-fingerprint.js';

const SESSION_COOKIE = 'robos_admin_session';
const SESSION_TTL_HOURS = 24;

// ----------------------------------------------------------------------------
// Auth
// ----------------------------------------------------------------------------

/**
 * GET /auth?token=XXX  →  daca token valid, seteaza cookie + redirect /
 */
export async function handleAdminAuthCallback(request, env) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  if (!token) return error('missing_token', 400);

  const expected = env.LICENSE_INTERNAL_API_TOKEN;
  if (!expected) return error('admin_token_not_configured', 500);

  // Constant-time compare ar fi ideal, dar Workers' === pe stringuri scurte
  // e suficient de bun pentru tokenurile noastre de 64 hex chars.
  if (token !== expected) {
    await logEvent(env.DB, {
      event_type: 'admin_login',
      details: { stage: 'invalid_token', token_prefix: token.slice(0, 8) },
      ip: clientIp(request),
      user_agent: userAgent(request),
    });
    return error('invalid_token', 401);
  }

  const sessionToken = generateRandomToken(32);
  await createSession(
    env.DB,
    sessionToken,
    env.ADMIN_EMAIL || 'admin',
    clientIp(request),
    userAgent(request),
    SESSION_TTL_HOURS * 60 * 60 * 1000
  );

  await logEvent(env.DB, {
    event_type: 'admin_login',
    details: { stage: 'session_created' },
    ip: clientIp(request),
    user_agent: userAgent(request),
  });

  const cookie = setCookieHeader(SESSION_COOKIE, sessionToken, {
    maxAge: SESSION_TTL_HOURS * 60 * 60,
  });

  return new Response(null, {
    status: 302,
    headers: {
      location: `https://${env.DOMAIN_ADMIN}/`,
      'set-cookie': cookie,
    },
  });
}

export async function handleAdminLogout(request, env) {
  const cookies = parseCookies(request.headers.get('cookie'));
  const sessionToken = cookies[SESSION_COOKIE];
  if (sessionToken) await deleteSession(env.DB, sessionToken);

  return new Response(null, {
    status: 302,
    headers: {
      location: `https://${env.DOMAIN_ADMIN}/?logged_out=1`,
      'set-cookie': setCookieHeader(SESSION_COOKIE, '', { maxAge: 0 }),
    },
  });
}

async function requireAuth(request, env) {
  const cookies = parseCookies(request.headers.get('cookie'));
  const sessionToken = cookies[SESSION_COOKIE];
  if (!sessionToken) return null;

  const session = await getSession(env.DB, sessionToken);
  if (!session) return null;
  return session;
}

/**
 * Verifica daca request-ul are sesiune valida. Folosit de admin HTML
 * sa stie ce sa afiseze (dashboard sau ecran "lipseste token").
 */
export async function isAuthenticated(request, env) {
  return (await requireAuth(request, env)) !== null;
}

// ----------------------------------------------------------------------------
// API endpoints (require session)
// ----------------------------------------------------------------------------

export async function handleAdminApi(request, env, path) {
  const session = await requireAuth(request, env);
  if (!session) return error('unauthorized', 401);

  if (path === '/admin/api/stats' && request.method === 'GET') {
    const stats = await getStats(env.DB);
    return json({ ok: true, stats });
  }

  if (path === '/admin/api/licenses' && request.method === 'GET') {
    const url = new URL(request.url);
    const search = url.searchParams.get('q') || '';
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 500);
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const result = await listLicenses(env.DB, { limit, offset, search });
    return json({ ok: true, licenses: result.results || [] });
  }

  // GET /admin/api/license/{id}
  const licMatch = path.match(/^\/admin\/api\/license\/([^/]+)$/);
  if (licMatch && request.method === 'GET') {
    const id = licMatch[1];
    const [license, binds, events] = await Promise.all([
      getLicense(env.DB, id),
      getActiveBindsForLicense(env.DB, id),
      getEventsForLicense(env.DB, id),
    ]);
    if (!license) return error('not_found', 404);
    return json({
      ok: true,
      license,
      binds: binds.results || [],
      events: events.results || [],
    });
  }

  // POST /admin/api/license/{id}/revoke
  const revokeMatch = path.match(/^\/admin\/api\/license\/([^/]+)\/revoke$/);
  if (revokeMatch && request.method === 'POST') {
    const id = revokeMatch[1];
    const license = await getLicense(env.DB, id);
    if (!license) return error('not_found', 404);
    await revokeLicense(env.DB, id);
    await logEvent(env.DB, {
      license_id: id,
      event_type: 'revoke',
      details: { by: session.email },
      ip: clientIp(request),
      user_agent: userAgent(request),
    });
    return json({ ok: true });
  }

  // POST /admin/api/licenses/create — admin (cu sesiune) creeaza licenta direct.
  // Worker NU trimite email — admin foloseste download_url returnat manual,
  // SAU app-ul de plata trimite emailul prin SMTP-ul propriu.
  if (path === '/admin/api/licenses/create' && request.method === 'POST') {
    const body = await readJson(request);
    if (!body || !body.email) return error('missing_email', 400);

    const licenseId = generateLicenseId();

    await createLicense(env.DB, {
      id: licenseId,
      email: body.email,
      tier: body.tier || 'standard',
      source: body.source || 'manual',
      source_ref: body.source_ref || null,
      amount_cents: body.amount_cents || null,
      bundle_with_fda: body.bundle_with_fda ? 1 : 0,
      notes: body.notes || null,
      expires_at: body.expires_at || null,
    });

    await logEvent(env.DB, {
      license_id: licenseId,
      event_type: 'license_created',
      details: {
        email: body.email,
        tier: body.tier || 'standard',
        source: body.source || 'manual',
        bundle_with_fda: !!body.bundle_with_fda,
        by: session.email,
      },
      ip: clientIp(request),
      user_agent: userAgent(request),
    });

    const downloadToken = generateShortId(16);
    await createDownloadToken(env.DB, downloadToken, licenseId);
    const downloadUrl = `https://${env.DOMAIN_DOWNLOAD}/${downloadToken}`;

    return json({
      ok: true,
      license_id: licenseId,
      download_url: downloadUrl,
      download_token: downloadToken,
    });
  }

  return error('not_found', 404);
}
