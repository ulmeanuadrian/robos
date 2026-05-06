// POST /bind — primul run pe un device, primeste JWT bound de hardware.
//
// Body: { license_id, hardware_hash, os, robos_version }
// Returneaza: { jwt, expires_at }

import { json, error, readJson, clientIp, userAgent } from '../lib/http.js';
import { isValidHardwareHash } from '../lib/hardware-fingerprint.js';
import { sign } from '../lib/jwt.js';
import { getLicense, createBind, getActiveBindsForLicense, logEvent, touchBind } from '../lib/d1.js';

const JWT_TTL_DAYS = 90;

export async function handleBind(request, env, privateKey) {
  const body = await readJson(request);
  if (!body) return error('invalid_json', 400);

  const { license_id, hardware_hash, os, robos_version } = body;

  if (!license_id || typeof license_id !== 'string') return error('missing_license_id', 400);
  if (!isValidHardwareHash(hardware_hash)) return error('invalid_hardware_hash', 400);

  const ip = clientIp(request);
  const ua = userAgent(request);

  const license = await getLicense(env.DB, license_id);
  if (!license) {
    await logEvent(env.DB, {
      event_type: 'verify_failed',
      details: { reason: 'license_not_found', license_id },
      ip,
      user_agent: ua,
    });
    return error('license_not_found', 404);
  }

  if (license.status !== 'active') {
    return error(`license_${license.status}`, 403);
  }

  if (license.expires_at && license.expires_at < Date.now()) {
    return error('license_expired', 403);
  }

  // Daca acelasi hardware_hash exista deja active pentru acest license -> e
  // un re-run pe acelasi device (utilizator a sters .license.jwt local).
  // Acceptam fara rebind logic, doar reissue JWT.
  const activeBinds = await getActiveBindsForLicense(env.DB, license_id);
  const existing = activeBinds.results?.find((b) => b.hardware_hash === hardware_hash);

  if (existing) {
    await touchBind(env.DB, license_id, hardware_hash);
    await logEvent(env.DB, {
      license_id,
      event_type: 'bind',
      details: { reuse: true, hardware_hash, os, robos_version },
      ip,
      user_agent: ua,
    });
  } else {
    // Hardware nou. Validate threshold de active binds simultane.
    const activeCount = activeBinds.results?.length || 0;
    if (activeCount >= 2) {
      // Detectare partajare. Nu blocam ferm la bind, dar logam pentru admin.
      await logEvent(env.DB, {
        license_id,
        event_type: 'bind',
        details: {
          warning: 'multiple_active_binds',
          active_count: activeCount,
          new_hardware: hardware_hash,
        },
        ip,
        user_agent: ua,
      });
    }

    await createBind(env.DB, {
      license_id,
      hardware_hash,
      os,
      robos_version,
      ip,
      user_agent: ua,
    });

    await logEvent(env.DB, {
      license_id,
      event_type: 'bind',
      details: { hardware_hash, os, robos_version },
      ip,
      user_agent: ua,
    });
  }

  // Issue JWT bound de hardware
  const now = Math.floor(Date.now() / 1000);
  const exp = now + JWT_TTL_DAYS * 24 * 60 * 60;

  const payload = {
    iss: 'robos.vip',
    sub: license_id,
    hw: hardware_hash,
    tier: license.tier,
    ver: license.version_entitlement,
    iat: now,
    exp,
  };

  const jwt = await sign(payload, privateKey);

  return json({ ok: true, jwt, expires_at: exp });
}
