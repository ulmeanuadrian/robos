// license-check.js — validare licenta robOS, runtime local.
//
// Apelat de hook-user-prompt.js la fiecare prompt. Returneaza:
//   { ok: true, license_id, expires_at }   — valid, lasa promptul sa treaca
//   { ok: false, code, message, action }   — invalid, hook-ul afiseaza message
//
// Strategy:
//   1. Citeste ~/.robos/license.jwt → daca valid + hardware match → OK (~5ms)
//   2. Daca lipseste → cauta .license-stamp in proiect → bind silent → save JWT (~400ms, doar prima oara)
//   3. Daca expira in <30 zile → background refresh (nu blocheaza promptul)
//   4. Niciun network call in operare normala (zero overhead)

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir, hostname, networkInterfaces, cpus, platform, arch } from 'node:os';
import { createHash, createPublicKey, verify as cryptoVerify } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import https from 'node:https';

// ----------------------------------------------------------------------------
// Constants — embedded public key + API URL
// ----------------------------------------------------------------------------

// Cheia publica Ed25519 (DER SPKI, base64) — generata 2026-05-06.
// SCHIMBA aici daca rotezi cheile (re-genereaza in licensing/scripts/generate-jwt-keys.js).
const PUBLIC_KEY_BASE64 = 'MCowBQYDK2VwAyEAFv3qxqc7YsyzGN6bR604SbDd7rMHpPwUw4Yf6vsnZ/4=';

const API_BASE = 'https://api.robos.vip';
const LICENSE_DIR = join(homedir(), '.robos');
const LICENSE_PATH = join(LICENSE_DIR, 'license.jwt');
const REFRESH_THRESHOLD_DAYS = 30;
const ROBOS_VERSION_PATH = (rootDir) => join(rootDir, 'VERSION');

// ----------------------------------------------------------------------------
// Hardware fingerprinting
// ----------------------------------------------------------------------------

export function computeHardwareHash() {
  const parts = [];
  parts.push(hostname() || 'unknown');

  const ifs = networkInterfaces();
  const macs = [];
  for (const name of Object.keys(ifs).sort()) {
    for (const iface of ifs[name] || []) {
      if (!iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') {
        macs.push(iface.mac);
      }
    }
  }
  parts.push(macs.length ? macs.sort()[0] : 'no-mac');

  const cpu = cpus()[0];
  parts.push(cpu ? `${cpu.model}|${cpu.speed}` : 'no-cpu');

  parts.push(platform(), arch());

  const fingerprint = parts.join('|');
  return createHash('sha256').update(fingerprint).digest('hex');
}

// ----------------------------------------------------------------------------
// Public key import + JWT verification
// ----------------------------------------------------------------------------

let _publicKey = null;
function getPublicKey() {
  if (!_publicKey) {
    _publicKey = createPublicKey({
      key: Buffer.from(PUBLIC_KEY_BASE64, 'base64'),
      format: 'der',
      type: 'spki',
    });
  }
  return _publicKey;
}

function base64UrlDecode(s) {
  let str = s.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64');
}

function verifyJwt(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;
    const signingInput = Buffer.from(`${headerB64}.${payloadB64}`);
    const signature = base64UrlDecode(signatureB64);

    const valid = cryptoVerify(null, signingInput, getPublicKey(), signature);
    if (!valid) return null;

    const payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf-8'));

    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return { __expired: true, ...payload };
    }

    return payload;
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------------------
// HTTP helpers (Node native, no deps)
// ----------------------------------------------------------------------------

function httpPost(url, body, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const data = Buffer.from(JSON.stringify(body));
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + (u.search || ''),
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': data.length,
          'user-agent': 'robos-licence-check/1',
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
            resolve({ status: res.statusCode, body: parsed });
          } catch {
            resolve({ status: res.statusCode, body: null });
          }
        });
      }
    );
    req.on('error', (err) => resolve({ status: 0, body: null, error: err.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 0, body: null, error: 'timeout' });
    });
    req.write(data);
    req.end();
  });
}

// ----------------------------------------------------------------------------
// First-run bind: cauta .license-stamp + face POST /bind
// ----------------------------------------------------------------------------

async function tryFirstRunBind(rootDir) {
  const stampPath = join(rootDir, '.license-stamp');
  if (!existsSync(stampPath)) {
    return {
      ok: false,
      code: 'no_license',
      message: 'robOS nu are licenta valida pe acest laptop. Daca ai cumparat, descarca arhiva proaspata din emailul cu link-ul de download.',
      action: 'download_fresh',
    };
  }

  const seedJwt = readFileSync(stampPath, 'utf-8').trim();
  const seedPayload = verifyJwt(seedJwt);

  if (!seedPayload || seedPayload.__expired) {
    return {
      ok: false,
      code: 'invalid_stamp',
      message: 'Stamp-ul de licenta din .license-stamp e invalid sau expirat. Cere link nou de download.',
      action: 'request_new_link',
    };
  }

  const hardwareHash = computeHardwareHash();
  let robosVersion = '0.0.0';
  try {
    if (existsSync(ROBOS_VERSION_PATH(rootDir))) {
      robosVersion = readFileSync(ROBOS_VERSION_PATH(rootDir), 'utf-8').trim();
    }
  } catch {}

  const result = await httpPost(`${API_BASE}/bind`, {
    license_id: seedPayload.sub,
    hardware_hash: hardwareHash,
    os: `${platform()}-${arch()}`,
    robos_version: robosVersion,
  });

  if (result.status !== 200 || !result.body?.ok) {
    if (result.error === 'timeout' || result.status === 0) {
      return {
        ok: false,
        code: 'network_required',
        message: 'robOS are nevoie de conexiune la internet la prima rulare ca sa activeze licenta. Conecteaza-te si reincearca.',
        action: 'check_network',
      };
    }
    return {
      ok: false,
      code: 'bind_failed',
      message: `Activarea licentei a esuat: ${result.body?.error || 'eroare necunoscuta'}. Scrie-mi: adrian@robos.vip.`,
      action: 'contact_support',
    };
  }

  // Save bound JWT
  if (!existsSync(LICENSE_DIR)) mkdirSync(LICENSE_DIR, { recursive: true });
  writeFileSync(LICENSE_PATH, result.body.jwt, { mode: 0o600 });

  return {
    ok: true,
    license_id: seedPayload.sub,
    expires_at: result.body.expires_at,
    just_bound: true,
  };
}

// ----------------------------------------------------------------------------
// Background refresh — fire and forget
// ----------------------------------------------------------------------------

async function backgroundRefresh(currentJwt) {
  const result = await httpPost(`${API_BASE}/refresh`, { jwt: currentJwt });
  if (result.status === 200 && result.body?.ok) {
    try {
      writeFileSync(LICENSE_PATH, result.body.jwt, { mode: 0o600 });
    } catch {}
  }
}

// ----------------------------------------------------------------------------
// Dev mode detection — read .env, look for ROBOS_DEV=1.
// Adrian-only escape; not documented in customer .env.example.
// ----------------------------------------------------------------------------

function isDevMode(rootDir) {
  if (process.env.ROBOS_DEV === '1') return true;
  try {
    const envPath = join(rootDir, '.env');
    if (!existsSync(envPath)) return false;
    const lines = readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const m = line.trim().match(/^ROBOS_DEV\s*=\s*(.*)$/);
      if (m) return m[1].replace(/^["']|["']$/g, '').trim() === '1';
    }
    return false;
  } catch {
    return false;
  }
}

// ----------------------------------------------------------------------------
// Main entry
// ----------------------------------------------------------------------------

export async function checkLicense(rootDir) {
  if (isDevMode(rootDir)) {
    return { ok: true, license_id: 'dev', expires_at: 0, dev: true };
  }

  // 1. Try existing JWT
  if (existsSync(LICENSE_PATH)) {
    let jwt;
    try {
      jwt = readFileSync(LICENSE_PATH, 'utf-8').trim();
    } catch {
      jwt = null;
    }

    if (jwt) {
      const payload = verifyJwt(jwt);

      if (payload && !payload.__expired) {
        // Hardware match
        const hardwareHash = computeHardwareHash();
        if (payload.hw === hardwareHash) {
          // Valid. Check if needs background refresh.
          const now = Math.floor(Date.now() / 1000);
          if (payload.exp - now < REFRESH_THRESHOLD_DAYS * 24 * 60 * 60) {
            backgroundRefresh(jwt).catch(() => {});
          }
          return { ok: true, license_id: payload.sub, expires_at: payload.exp };
        }

        // Hardware mismatch — try silent rebind
        return tryRebind(payload.sub, payload.hw, rootDir);
      }

      // Expired JWT — try refresh, fallback to first-run bind
      if (payload && payload.__expired) {
        const refreshResult = await httpPost(`${API_BASE}/refresh`, { jwt });
        if (refreshResult.status === 200 && refreshResult.body?.ok) {
          writeFileSync(LICENSE_PATH, refreshResult.body.jwt, { mode: 0o600 });
          return {
            ok: true,
            license_id: payload.sub,
            expires_at: refreshResult.body.expires_at,
          };
        }
        return {
          ok: false,
          code: 'refresh_failed',
          message: 'Licenta a expirat si reinnoirea a esuat. Verifica conexiunea sau scrie-mi: adrian@robos.vip.',
          action: 'contact_support',
        };
      }
    }
  }

  // 2. No JWT — try first-run bind from .license-stamp
  return tryFirstRunBind(rootDir);
}

async function tryRebind(licenseId, oldHardwareHash, rootDir) {
  const newHardwareHash = computeHardwareHash();
  let robosVersion = '0.0.0';
  try {
    if (existsSync(ROBOS_VERSION_PATH(rootDir))) {
      robosVersion = readFileSync(ROBOS_VERSION_PATH(rootDir), 'utf-8').trim();
    }
  } catch {}

  const result = await httpPost(`${API_BASE}/rebind`, {
    license_id: licenseId,
    new_hardware_hash: newHardwareHash,
    old_hardware_hash: oldHardwareHash,
    os: `${platform()}-${arch()}`,
    robos_version: robosVersion,
  });

  if (result.status === 200 && result.body?.ok) {
    writeFileSync(LICENSE_PATH, result.body.jwt, { mode: 0o600 });
    return {
      ok: true,
      license_id: licenseId,
      expires_at: result.body.expires_at,
      rebound: true,
    };
  }

  if (result.body?.code === 'rebind_blocked') {
    return {
      ok: false,
      code: 'rebind_blocked',
      message: 'Detectam activari pe prea multe device-uri. Scrie-mi la adrian@robos.vip sa lamurim.',
      action: 'contact_support',
    };
  }

  return {
    ok: false,
    code: 'hardware_mismatch',
    message: 'Licenta e legata de alt hardware. Daca ti-ai schimbat laptopul, scrie-mi: adrian@robos.vip.',
    action: 'contact_support',
  };
}

// CLI usage: `node scripts/license-check.js` printeaza statusul
const __license_check_filename = fileURLToPath(import.meta.url);
if (process.argv[1] && process.argv[1].replace(/\\/g, '/') === __license_check_filename.replace(/\\/g, '/')) {
  const rootDir = process.argv[2] || join(dirname(__license_check_filename), '..');
  checkLicense(rootDir).then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
  });
}
