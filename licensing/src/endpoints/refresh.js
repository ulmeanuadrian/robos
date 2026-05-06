// POST /refresh — JWT-ul existent valid se refresheaza la unul nou (TTL extins).
// Hook-ul local apeleaza la 60d din 90d. Permite revocare via re-validare DB.
//
// Body: { jwt }
// Returneaza: { jwt: <new>, expires_at }

import { json, error, readJson, clientIp, userAgent } from '../lib/http.js';
import { sign, verify } from '../lib/jwt.js';
import { getLicense, touchBind, logEvent } from '../lib/d1.js';

const JWT_TTL_DAYS = 90;

export async function handleRefresh(request, env, privateKey, publicKey) {
  const body = await readJson(request);
  if (!body || !body.jwt) return error('missing_jwt', 400);

  const ip = clientIp(request);
  const ua = userAgent(request);

  const payload = await verify(body.jwt, publicKey);
  if (!payload) {
    await logEvent(env.DB, {
      event_type: 'verify_failed',
      details: { reason: 'invalid_or_expired_jwt' },
      ip,
      user_agent: ua,
    });
    return error('invalid_jwt', 401);
  }

  const license = await getLicense(env.DB, payload.sub);
  if (!license || license.status !== 'active') {
    return error('license_inactive', 403);
  }
  if (license.expires_at && license.expires_at < Date.now()) {
    return error('license_expired', 403);
  }

  await touchBind(env.DB, payload.sub, payload.hw);
  await logEvent(env.DB, {
    license_id: payload.sub,
    event_type: 'refresh',
    details: { hardware_hash: payload.hw },
    ip,
    user_agent: ua,
  });

  // Issue refreshed JWT
  const now = Math.floor(Date.now() / 1000);
  const exp = now + JWT_TTL_DAYS * 24 * 60 * 60;

  const newPayload = {
    iss: 'robos.vip',
    sub: payload.sub,
    hw: payload.hw,
    tier: license.tier,
    ver: license.version_entitlement,
    iat: now,
    exp,
  };

  const jwt = await sign(newPayload, privateKey);

  return json({ ok: true, jwt, expires_at: exp });
}
