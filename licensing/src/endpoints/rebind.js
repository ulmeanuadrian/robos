// POST /rebind — utilizatorul si-a schimbat hardware-ul (OS reinstall, laptop nou).
// Verifica threshold si emite JWT pentru noul hardware.
//
// Body: { license_id, new_hardware_hash, old_hardware_hash, os, robos_version }
// Returneaza: { jwt, expires_at }
// Errors: 403 rebind_blocked daca threshold depasit.

import { json, error, readJson, clientIp, userAgent } from '../lib/http.js';
import { isValidHardwareHash } from '../lib/hardware-fingerprint.js';
import { sign } from '../lib/jwt.js';
import {
  getLicense,
  createBind,
  getActiveBindsForLicense,
  getRecentBindCount,
  markBindReplaced,
  logEvent,
} from '../lib/d1.js';

const JWT_TTL_DAYS = 90;
const REBIND_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
const REBIND_SOFT_LIMIT = 3;
const REBIND_HARD_LIMIT = 5;

export async function handleRebind(request, env, privateKey) {
  const body = await readJson(request);
  if (!body) return error('invalid_json', 400);

  const { license_id, new_hardware_hash, old_hardware_hash, os, robos_version } = body;

  if (!license_id) return error('missing_license_id', 400);
  if (!isValidHardwareHash(new_hardware_hash)) return error('invalid_new_hardware_hash', 400);

  const ip = clientIp(request);
  const ua = userAgent(request);

  const license = await getLicense(env.DB, license_id);
  if (!license || license.status !== 'active') {
    return error('license_inactive', 403);
  }
  if (license.expires_at && license.expires_at < Date.now()) {
    return error('license_expired', 403);
  }

  // Count rebinds in last 90 days
  const recentCount = await getRecentBindCount(env.DB, license_id, Date.now() - REBIND_WINDOW_MS);

  if (recentCount >= REBIND_HARD_LIMIT) {
    await logEvent(env.DB, {
      license_id,
      event_type: 'rebind_blocked',
      details: {
        reason: 'hard_limit_exceeded',
        recent_count: recentCount,
        limit: REBIND_HARD_LIMIT,
      },
      ip,
      user_agent: ua,
    });
    return error('rebind_limit_exceeded', 403, 'rebind_blocked');
  }

  // Mark old bind as replaced (daca cunoastem hardware-ul vechi)
  if (old_hardware_hash && isValidHardwareHash(old_hardware_hash)) {
    const activeBinds = await getActiveBindsForLicense(env.DB, license_id);
    const oldBind = activeBinds.results?.find((b) => b.hardware_hash === old_hardware_hash);
    if (oldBind) await markBindReplaced(env.DB, oldBind.id);
  }

  // Create new bind
  await createBind(env.DB, {
    license_id,
    hardware_hash: new_hardware_hash,
    os,
    robos_version,
    ip,
    user_agent: ua,
  });

  await logEvent(env.DB, {
    license_id,
    event_type: 'rebind',
    details: {
      old_hardware_hash,
      new_hardware_hash,
      os,
      robos_version,
      recent_count: recentCount + 1,
      soft_warn: recentCount + 1 >= REBIND_SOFT_LIMIT,
    },
    ip,
    user_agent: ua,
  });

  // Issue JWT pe noul hardware
  const now = Math.floor(Date.now() / 1000);
  const exp = now + JWT_TTL_DAYS * 24 * 60 * 60;

  const payload = {
    iss: 'robos.vip',
    sub: license_id,
    hw: new_hardware_hash,
    tier: license.tier,
    ver: license.version_entitlement,
    iat: now,
    exp,
  };

  const jwt = await sign(payload, privateKey);

  return json({ ok: true, jwt, expires_at: exp });
}
