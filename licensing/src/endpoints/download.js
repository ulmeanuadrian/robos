// GET /dl/{token} — descarca tarball-ul stamped.
//
// Token e un short id (16 hex). Validate, fetch licenta, build stamped tarball,
// stream catre user. Token-ul e single-license dar multi-use timp de 7 zile.

import { error } from '../lib/http.js';
import { sign } from '../lib/jwt.js';
import {
  getDownloadToken,
  getLicense,
  incrementDownloadConsumed,
  logEvent,
} from '../lib/d1.js';
import { streamLicensedTarball } from '../lib/tarball.js';

export async function handleDownload(token, request, env, privateKey) {
  if (!token || typeof token !== 'string') return error('missing_token', 400);

  const downloadRow = await getDownloadToken(env.DB, token);
  if (!downloadRow) return error('invalid_or_expired_token', 404);

  const license = await getLicense(env.DB, downloadRow.license_id);
  if (!license || license.status !== 'active') return error('license_inactive', 403);

  // Build "unbound" JWT — fara hardware lock, valabil 30 zile pentru bind initial.
  // Cand user-ul ruleaza primul prompt, hook-ul foloseste asta ca pe un seed
  // pentru bind, dupa care primeste JWT bound de hardware.
  const now = Math.floor(Date.now() / 1000);
  const seedJwt = await sign(
    {
      iss: 'robos.vip',
      sub: license.id,
      typ: 'seed',
      tier: license.tier,
      ver: license.version_entitlement,
      iat: now,
      exp: now + 30 * 24 * 60 * 60,
    },
    privateKey
  );

  await incrementDownloadConsumed(env.DB, token);
  await logEvent(env.DB, {
    license_id: license.id,
    event_type: 'download',
    details: { token, count: downloadRow.consumed_count + 1 },
    ip: request.headers.get('cf-connecting-ip'),
    user_agent: request.headers.get('user-agent'),
  });

  return streamLicensedTarball(env, seedJwt);
}
