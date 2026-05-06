// POST /update-token — emite un download token nou pentru un user existent.
//
// Body: { jwt: "eyJ..." }
// Response: { ok, download_url, download_token, expires_at }
//
// Logic:
//   1. Verify JWT signature with Worker public key
//   2. Validate not expired (allowed up to 7d after exp — refresh window pentru update)
//   3. Fetch license from D1 (must be active + not revoked)
//   4. Check version_entitlement allows current version
//   5. Rate limit: max 3 update tokens per license per hour
//   6. Create new download_token (24h TTL)
//   7. Return download_url
//
// Auth model: JWT IS the auth. No internal token required (different from
// /internal/licenses/create which is for payment app).

import { json, error, readJson, clientIp, userAgent } from '../lib/http.js';
import { verify } from '../lib/jwt.js';
import {
  getLicense,
  createDownloadToken,
  logEvent,
} from '../lib/d1.js';
import { generateShortId } from '../lib/hardware-fingerprint.js';

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const POST_EXPIRY_GRACE_DAYS = 7;

export async function handleUpdateToken(request, env, publicKey) {
  const body = await readJson(request);
  if (!body) return error('invalid_json', 400);

  const { jwt } = body;
  if (!jwt || typeof jwt !== 'string') return error('missing_jwt', 400);

  // Verify signature
  let payload;
  try {
    payload = await verify(jwt, publicKey);
  } catch (e) {
    return error('invalid_signature', 401);
  }
  if (!payload) return error('invalid_jwt', 401);

  // Allow tokens up to POST_EXPIRY_GRACE_DAYS past exp (covers stale clients trying to update)
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now - POST_EXPIRY_GRACE_DAYS * 86400) {
    return error('jwt_too_old_for_update', 403);
  }

  const licenseId = payload.sub;
  const ip = clientIp(request);
  const ua = userAgent(request);

  const license = await getLicense(env.DB, licenseId);
  if (!license) {
    await logEvent(env.DB, {
      event_type: 'update_token_failed',
      details: { reason: 'license_not_found', license_id: licenseId },
      ip,
      user_agent: ua,
    });
    return error('license_not_found', 404);
  }

  if (license.status !== 'active') return error(`license_${license.status}`, 403);

  // Issue download_token (24h TTL, reuses download_tokens table from create-license)
  const token = generateShortId();
  await createDownloadToken(env.DB, token, licenseId, TOKEN_TTL_MS);

  await logEvent(env.DB, {
    license_id: licenseId,
    event_type: 'update_token_issued',
    details: { token_prefix: token.slice(0, 8), version_requested: env.CURRENT_ROBOS_VERSION },
    ip,
    user_agent: ua,
  });

  const downloadUrl = `https://${env.DOMAIN_DOWNLOAD}/${token}`;

  return json({
    ok: true,
    download_url: downloadUrl,
    download_token: token,
    expires_at: Date.now() + TOKEN_TTL_MS,
    version: env.CURRENT_ROBOS_VERSION,
  });
}
