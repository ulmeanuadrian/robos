// Token-based auth middleware for sensitive dashboard endpoints.
//
// Threat model:
//   - Server binds to 127.0.0.1 (loopback only) → no LAN exposure by default.
//   - But: a malicious page in the user's browser (evil.com) can make fetch()
//     calls to localhost:3001. Without auth, any endpoint is reachable.
//   - Mitigation: protected endpoints require `Authorization: Bearer <token>`,
//     and the token is fetched by the dashboard UI from a same-origin endpoint
//     that rejects cross-origin Origin headers.
//   - Browser CORS will block evil.com from reading the token endpoint response,
//     and even if it tried, the Origin header would mismatch and we reject.
//
// Token source: process.env.ROBOS_DASHBOARD_TOKEN, populated by setup-env.js.
//
// Exemptions: GET endpoints that expose no secrets (memory, audit, activity,
// connection-health, skills list) are NOT protected — they're informational.
// Only mutating endpoints and secret-bearing endpoints require the token.

import { timingSafeEqual } from 'crypto';

function getServerToken() {
  return process.env.ROBOS_DASHBOARD_TOKEN || '';
}

function tokensMatch(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

/**
 * Verify Authorization: Bearer header. Returns null on success, or an error
 * object { status, message } on failure. Caller is responsible for sending
 * the response.
 */
export function checkBearer(req) {
  const expected = getServerToken();
  if (!expected) {
    return {
      status: 503,
      message: 'Server token not configured. Run: node scripts/setup-env.js',
    };
  }
  const auth = req.headers['authorization'] || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return { status: 401, message: 'Missing Authorization: Bearer token' };
  if (!tokensMatch(m[1].trim(), expected)) {
    return { status: 401, message: 'Invalid token' };
  }
  return null;
}

/**
 * Determine if a request originates from the same origin as the server.
 * Used to gate the token-fetch endpoint: only the local UI can read it.
 *
 * Allowed:
 *   - No Origin header at all (curl, server-to-server, native client)
 *   - Origin matches http://127.0.0.1:PORT or http://localhost:PORT
 *
 * Rejected:
 *   - Any other Origin (cross-site browser fetch)
 */
export function isSameOrigin(req, port) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const allowed = new Set([
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
  ]);
  return allowed.has(origin);
}

/**
 * GET /api/auth/token — return the dashboard token IF the request is same-origin.
 * The UI calls this once on init and uses it for all subsequent protected requests.
 *
 * SECURITY: This endpoint is the bootstrap. If isSameOrigin returns false,
 * we return 403. Browser CORS will additionally block evil.com from reading
 * the response body even if our check accidentally passed.
 */
export function getAuthToken(req, port) {
  if (!isSameOrigin(req, port)) {
    const err = new Error('Forbidden: cross-origin request');
    err.statusCode = 403;
    throw err;
  }
  const token = getServerToken();
  if (!token) {
    const err = new Error('Server token not configured. Run: node scripts/setup-env.js');
    err.statusCode = 503;
    throw err;
  }
  return { token };
}
