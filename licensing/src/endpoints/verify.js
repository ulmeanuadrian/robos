// POST /verify — verificare rapida server-side a unui JWT (revocare).
// Hook-ul local valideaza JWT-ul OFFLINE in mod normal. /verify e folosit DOAR:
//   1. La start of day (lazy check) — daca user-ul a fost revoke-uit
//   2. Cand exista incertitudine despre validitate
//
// Body: { jwt }
// Returneaza: { valid: bool, reason?: string }

import { json, readJson, clientIp, userAgent } from '../lib/http.js';
import { verify } from '../lib/jwt.js';
import { getLicense, logEvent } from '../lib/d1.js';

export async function handleVerify(request, env, publicKey) {
  const body = await readJson(request);
  if (!body || !body.jwt) return json({ valid: false, reason: 'missing_jwt' }, 400);

  const ip = clientIp(request);
  const ua = userAgent(request);

  const payload = await verify(body.jwt, publicKey);
  if (!payload) {
    return json({ valid: false, reason: 'invalid_or_expired_signature' });
  }

  const license = await getLicense(env.DB, payload.sub);
  if (!license) {
    await logEvent(env.DB, {
      event_type: 'verify_failed',
      details: { reason: 'license_not_found', license_id: payload.sub },
      ip,
      user_agent: ua,
    });
    return json({ valid: false, reason: 'license_not_found' });
  }

  if (license.status === 'revoked') {
    return json({ valid: false, reason: 'license_revoked' });
  }
  if (license.expires_at && license.expires_at < Date.now()) {
    return json({ valid: false, reason: 'license_expired' });
  }

  return json({ valid: true });
}
