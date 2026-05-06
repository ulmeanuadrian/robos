// POST /internal/licenses/create — creeaza o licenta (apelat de admin dashboard
// SAU de aplicatia externa de plata dupa confirmare).
//
// Auth: Authorization: Bearer {LICENSE_INTERNAL_API_TOKEN}
//
// Body: { email, tier?, source?, source_ref?, amount_cents?, bundle_with_fda?,
//         notes?, expires_at?, send_email? }
// Returneaza: { license_id, download_url, download_token, email_sent }

import { json, error, readJson, clientIp, userAgent } from '../lib/http.js';
import {
  createLicense,
  createDownloadToken,
  logEvent,
} from '../lib/d1.js';
import {
  generateLicenseId,
  generateRandomToken,
  generateShortId,
} from '../lib/hardware-fingerprint.js';
// Worker NU trimite email — payment app-ul lui Adrian primeste download_url
// in response si trimite welcome email via SMTP-ul propriu.
// Templates de email pentru referinta sunt in src/lib/email.js (welcomeEmail)
// — copy-paste-ul lor in payment app cand integreaza.

export async function handleCreateLicense(request, env) {
  // Auth: must have valid internal API token
  const authHeader = request.headers.get('authorization') || '';
  const expectedToken = env.LICENSE_INTERNAL_API_TOKEN;
  if (!expectedToken) {
    return error('internal_token_not_configured', 500);
  }
  if (authHeader !== `Bearer ${expectedToken}`) {
    return error('unauthorized', 401);
  }

  const body = await readJson(request);
  if (!body) return error('invalid_json', 400);

  const { email, tier, source, source_ref, amount_cents, bundle_with_fda, notes, expires_at } = body;

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return error('invalid_email', 400);
  }

  const ip = clientIp(request);
  const ua = userAgent(request);

  const licenseId = generateLicenseId();

  await createLicense(env.DB, {
    id: licenseId,
    email,
    tier: tier || 'standard',
    source: source || 'manual',
    source_ref: source_ref || null,
    amount_cents: amount_cents || null,
    bundle_with_fda: bundle_with_fda ? 1 : 0,
    notes: notes || null,
    expires_at: expires_at || null,
  });

  await logEvent(env.DB, {
    license_id: licenseId,
    event_type: 'license_created',
    details: {
      email,
      tier: tier || 'standard',
      source: source || 'manual',
      source_ref,
      amount_cents,
      bundle_with_fda: !!bundle_with_fda,
    },
    ip,
    user_agent: ua,
  });

  // Generate download token
  const downloadToken = generateShortId(16);
  await createDownloadToken(env.DB, downloadToken, licenseId);
  const downloadUrl = `https://${env.DOMAIN_DOWNLOAD}/${downloadToken}`;

  return json({
    ok: true,
    license_id: licenseId,
    download_url: downloadUrl,
    download_token: downloadToken,
  });
}
