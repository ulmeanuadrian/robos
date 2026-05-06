// Browser-side API client — fetches the dashboard token once at first use,
// then attaches it to all subsequent requests via Authorization: Bearer.
//
// Usage:
//   import { apiFetch } from '../lib/api-client';
//   const res = await apiFetch('/api/settings/env');
//   const body = await apiFetch('/api/settings/env', {
//     method: 'PUT',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({ key: 'X', value: 'y' }),
//   });
//
// Token lifecycle:
//   - Module-level memory only. Not persisted to localStorage (XSS protection).
//   - Lost on page reload — re-fetched transparently on next call.
//   - If /api/auth/token returns 503 ("token not configured"), apiFetch falls
//     back to plain fetch; protected endpoints will then return 401, and the
//     caller can show "Run setup-env.js" guidance.

let cachedToken: string | null = null;
let tokenPromise: Promise<string | null> | null = null;

async function fetchToken(): Promise<string | null> {
  try {
    const res = await fetch('/api/auth/token', { credentials: 'same-origin' });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.token === 'string' ? data.token : null;
  } catch {
    return null;
  }
}

async function getToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  if (!tokenPromise) {
    tokenPromise = fetchToken().then(t => {
      if (t) cachedToken = t;
      tokenPromise = null;
      return t;
    });
  }
  return tokenPromise;
}

export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = await getToken();
  const headers = new Headers(init.headers);
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(input, { ...init, headers, credentials: 'same-origin' });
}

/**
 * Force re-fetch of the token (e.g. after the user runs setup-env.js to
 * generate a fresh token without reloading the page).
 */
export function invalidateToken(): void {
  cachedToken = null;
  tokenPromise = null;
}

/**
 * Check whether the client currently has a token cached.
 * Used by UI to show "auth required" states without waiting for a 401.
 */
export function hasToken(): boolean {
  return cachedToken !== null;
}
