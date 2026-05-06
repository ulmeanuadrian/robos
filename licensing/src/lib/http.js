// HTTP response helpers + request parsers

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...extraHeaders,
    },
  });
}

export function error(message, status = 400, code = null) {
  return json({ ok: false, error: message, code }, status);
}

export function ok(data = {}) {
  return json({ ok: true, ...data }, 200);
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function clientIp(request) {
  return request.headers.get('cf-connecting-ip') || 'unknown';
}

export function userAgent(request) {
  return (request.headers.get('user-agent') || '').slice(0, 256);
}

// Cookie helpers (admin sessions)
export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k) out[k] = decodeURIComponent(v.join('='));
  }
  return out;
}

export function setCookieHeader(name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${opts.path || '/'}`);
  parts.push('HttpOnly');
  parts.push('Secure');
  parts.push(`SameSite=${opts.sameSite || 'Lax'}`);
  if (opts.maxAge) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.domain) parts.push(`Domain=${opts.domain}`);
  return parts.join('; ');
}
