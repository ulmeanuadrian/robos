// D1 query helpers — wrappers care fac codul de endpoint mai citibil.

export async function getLicense(db, licenseId) {
  return db.prepare('SELECT * FROM licenses WHERE id = ?').bind(licenseId).first();
}

export async function getLicenseByEmail(db, email) {
  return db.prepare('SELECT * FROM licenses WHERE email = ? ORDER BY created_at DESC').bind(email).all();
}

export async function listLicenses(db, { limit = 100, offset = 0, search = '' } = {}) {
  if (search) {
    return db
      .prepare(
        `SELECT * FROM licenses
         WHERE email LIKE ?1 OR id LIKE ?1 OR notes LIKE ?1
         ORDER BY created_at DESC LIMIT ?2 OFFSET ?3`
      )
      .bind(`%${search}%`, limit, offset)
      .all();
  }
  return db
    .prepare('SELECT * FROM licenses ORDER BY created_at DESC LIMIT ?1 OFFSET ?2')
    .bind(limit, offset)
    .all();
}

export async function createLicense(db, license) {
  const now = Date.now();
  return db
    .prepare(
      `INSERT INTO licenses
       (id, email, tier, status, source, source_ref, amount_cents, bundle_with_fda, version_entitlement, notes, created_at, expires_at)
       VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      license.id,
      license.email,
      license.tier || 'standard',
      license.source || 'manual',
      license.source_ref || null,
      license.amount_cents || null,
      license.bundle_with_fda ? 1 : 0,
      license.version_entitlement || '1',
      license.notes || null,
      now,
      license.expires_at || null
    )
    .run();
}

export async function revokeLicense(db, licenseId) {
  const now = Date.now();
  return db
    .prepare('UPDATE licenses SET status = ?, revoked_at = ? WHERE id = ?')
    .bind('revoked', now, licenseId)
    .run();
}

export async function getActiveBindsForLicense(db, licenseId) {
  return db
    .prepare("SELECT * FROM binds WHERE license_id = ? AND status = 'active' ORDER BY bound_at DESC")
    .bind(licenseId)
    .all();
}

export async function getRecentBindCount(db, licenseId, sinceMs) {
  const r = await db
    .prepare('SELECT COUNT(*) as c FROM binds WHERE license_id = ? AND bound_at >= ?')
    .bind(licenseId, sinceMs)
    .first();
  return r ? r.c : 0;
}

export async function createBind(db, bind) {
  const now = Date.now();
  return db
    .prepare(
      `INSERT INTO binds (license_id, hardware_hash, os, robos_version, ip, user_agent, bound_at, last_seen_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`
    )
    .bind(
      bind.license_id,
      bind.hardware_hash,
      bind.os || null,
      bind.robos_version || null,
      bind.ip || null,
      bind.user_agent || null,
      now,
      now
    )
    .run();
}

export async function markBindReplaced(db, bindId) {
  return db.prepare("UPDATE binds SET status = 'replaced' WHERE id = ?").bind(bindId).run();
}

export async function touchBind(db, licenseId, hardwareHash) {
  const now = Date.now();
  return db
    .prepare("UPDATE binds SET last_seen_at = ? WHERE license_id = ? AND hardware_hash = ? AND status = 'active'")
    .bind(now, licenseId, hardwareHash)
    .run();
}

export async function logEvent(db, { license_id, event_type, details, ip, user_agent }) {
  const now = Date.now();
  return db
    .prepare(
      `INSERT INTO events (license_id, event_type, details, ip, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(
      license_id || null,
      event_type,
      details ? JSON.stringify(details) : null,
      ip || null,
      user_agent || null,
      now
    )
    .run();
}

export async function getEventsForLicense(db, licenseId, limit = 50) {
  return db
    .prepare('SELECT * FROM events WHERE license_id = ? ORDER BY created_at DESC LIMIT ?')
    .bind(licenseId, limit)
    .all();
}

// --- Magic links / sessions

export async function createMagicLink(db, token, email, ttlMs = 5 * 60 * 1000) {
  const now = Date.now();
  return db
    .prepare('INSERT INTO magic_links (token, email, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(token, email, now, now + ttlMs)
    .run();
}

export async function consumeMagicLink(db, token) {
  const now = Date.now();
  const row = await db
    .prepare('SELECT * FROM magic_links WHERE token = ?')
    .bind(token)
    .first();
  if (!row) return null;
  if (row.used_at) return null;
  if (row.expires_at < now) return null;

  await db
    .prepare('UPDATE magic_links SET used_at = ? WHERE token = ?')
    .bind(now, token)
    .run();

  return row;
}

export async function createSession(db, token, email, ip, userAgent, ttlMs = 24 * 60 * 60 * 1000) {
  const now = Date.now();
  return db
    .prepare(
      'INSERT INTO admin_sessions (token, email, created_at, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .bind(token, email, now, now + ttlMs, ip || null, userAgent || null)
    .run();
}

export async function getSession(db, token) {
  const now = Date.now();
  const row = await db
    .prepare('SELECT * FROM admin_sessions WHERE token = ?')
    .bind(token)
    .first();
  if (!row) return null;
  if (row.expires_at < now) return null;
  return row;
}

export async function deleteSession(db, token) {
  return db.prepare('DELETE FROM admin_sessions WHERE token = ?').bind(token).run();
}

// --- Download tokens

export async function createDownloadToken(db, token, licenseId, ttlMs = 7 * 24 * 60 * 60 * 1000) {
  const now = Date.now();
  return db
    .prepare(
      'INSERT INTO download_tokens (token, license_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
    )
    .bind(token, licenseId, now, now + ttlMs)
    .run();
}

export async function getDownloadToken(db, token) {
  const now = Date.now();
  const row = await db
    .prepare('SELECT * FROM download_tokens WHERE token = ?')
    .bind(token)
    .first();
  if (!row) return null;
  if (row.expires_at < now) return null;
  return row;
}

export async function incrementDownloadConsumed(db, token) {
  return db
    .prepare('UPDATE download_tokens SET consumed_count = consumed_count + 1 WHERE token = ?')
    .bind(token)
    .run();
}

// --- Stats

export async function getStats(db) {
  const [active, revoked, totalBinds, last30dRevenue] = await Promise.all([
    db.prepare("SELECT COUNT(*) c FROM licenses WHERE status = 'active'").first(),
    db.prepare("SELECT COUNT(*) c FROM licenses WHERE status = 'revoked'").first(),
    db.prepare("SELECT COUNT(*) c FROM binds WHERE status = 'active'").first(),
    db
      .prepare(
        `SELECT COALESCE(SUM(amount_cents), 0) c FROM licenses WHERE created_at >= ? AND status = 'active'`
      )
      .bind(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .first(),
  ]);
  return {
    active_licenses: active?.c ?? 0,
    revoked_licenses: revoked?.c ?? 0,
    active_binds: totalBinds?.c ?? 0,
    last_30d_revenue_cents: last30dRevenue?.c ?? 0,
  };
}
