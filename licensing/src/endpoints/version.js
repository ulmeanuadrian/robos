// GET /version — public endpoint pentru update checks.
//
// Body: nimic (GET).
// Response: { current_version, minimum_version, changelog_url, released_at }
//
// Foloseste de scripts/update.js: client face GET, compara cu VERSION local,
// daca server.current_version > local → propune update.

import { json } from '../lib/http.js';

export async function handleVersion(_request, env) {
  return json({
    current_version: env.CURRENT_ROBOS_VERSION || '0.0.0',
    minimum_version: env.MINIMUM_ROBOS_VERSION || '0.4.0',
    changelog_url: env.CHANGELOG_URL || 'https://robos.vip/changelog',
    released_at: env.CURRENT_RELEASE_DATE || null,
  });
}
