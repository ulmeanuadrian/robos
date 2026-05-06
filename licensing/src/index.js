// robos-api — Cloudflare Worker entry point.
//
// Routare per host (custom domain mapped via wrangler.toml):
//   api.robos.vip     → endpoints licensing
//   admin.robos.vip   → admin dashboard + auth
//   robos.vip/dl/*    → download endpoint (public)

import { json, error } from './lib/http.js';
import { importPrivateKey, importPublicKey } from './lib/jwt.js';
import { handleBind } from './endpoints/bind.js';
import { handleRefresh } from './endpoints/refresh.js';
import { handleRebind } from './endpoints/rebind.js';
import { handleVerify } from './endpoints/verify.js';
import { handleDownload } from './endpoints/download.js';
import { handleCreateLicense } from './endpoints/create-license.js';
import { handleVersion } from './endpoints/version.js';
import { handleUpdateToken } from './endpoints/update-token.js';
import {
  handleAdminAuthCallback,
  handleAdminLogout,
  handleAdminApi,
} from './endpoints/admin.js';
import { ADMIN_HTML } from './admin-html.js';

// Cache CryptoKey pe parcursul lifetime-ului Worker (cold start o data)
let _privateKey = null;
let _publicKey = null;

async function getKeys(env) {
  if (!_privateKey) {
    if (!env.LICENSE_JWT_PRIVATE_KEY) {
      throw new Error('LICENSE_JWT_PRIVATE_KEY missing');
    }
    _privateKey = await importPrivateKey(env.LICENSE_JWT_PRIVATE_KEY);
  }
  if (!_publicKey) {
    if (!env.LICENSE_JWT_PUBLIC_KEY) {
      throw new Error('LICENSE_JWT_PUBLIC_KEY missing');
    }
    _publicKey = await importPublicKey(env.LICENSE_JWT_PUBLIC_KEY);
  }
  return { privateKey: _privateKey, publicKey: _publicKey };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const host = url.hostname;
    const path = url.pathname;

    try {
      // -----------------------------------------------------------------
      // Public download (dl.robos.vip/{token})
      // -----------------------------------------------------------------
      if (host === env.DOMAIN_DOWNLOAD) {
        const token = path.replace(/^\//, '').split('/')[0];
        const { privateKey } = await getKeys(env);
        return handleDownload(token, request, env, privateKey);
      }

      // -----------------------------------------------------------------
      // API endpoints (api.robos.vip)
      // -----------------------------------------------------------------
      if (host === env.DOMAIN_API) {
        if (path === '/health') return json({ ok: true, version: env.CURRENT_ROBOS_VERSION });
        if (path === '/version' && request.method === 'GET') return handleVersion(request, env);

        if (request.method === 'POST') {
          const { privateKey, publicKey } = await getKeys(env);

          if (path === '/bind') return handleBind(request, env, privateKey);
          if (path === '/refresh') return handleRefresh(request, env, privateKey, publicKey);
          if (path === '/rebind') return handleRebind(request, env, privateKey);
          if (path === '/verify') return handleVerify(request, env, publicKey);
          if (path === '/update-token') return handleUpdateToken(request, env, publicKey);
          if (path === '/internal/licenses/create') return handleCreateLicense(request, env);
        }

        return error('not_found', 404);
      }

      // -----------------------------------------------------------------
      // Admin (admin.robos.vip)
      // -----------------------------------------------------------------
      if (host === env.DOMAIN_ADMIN) {
        // /auth?token=XXX — Bearer token check, sets session cookie
        if (path === '/auth' && request.method === 'GET') {
          return handleAdminAuthCallback(request, env);
        }

        // /?token=XXX (root cu token in querystring) → trateaza ca /auth
        if (path === '/' && new URL(request.url).searchParams.has('token')) {
          return handleAdminAuthCallback(request, env);
        }

        if (path === '/logout') {
          return handleAdminLogout(request, env);
        }

        // Admin API (gated by session check inside handleAdminApi)
        if (path.startsWith('/admin/api/')) {
          return handleAdminApi(request, env, path);
        }

        // Static admin HTML — same SPA pentru tot. Daca nu exista cookie,
        // arata ecran cu instructiuni "lipseste token in URL".
        return new Response(ADMIN_HTML, {
          headers: {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'no-store',
          },
        });
      }

      return error('not_found', 404);
    } catch (e) {
      console.error('Worker error:', e.stack || e.message);
      return error('internal_error', 500);
    }
  },
};
