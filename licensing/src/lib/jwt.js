// JWT signing/verification cu Ed25519 (EdDSA).
// Worker side: importa cheia privata din secret string (PEM PKCS8) la cold start.
// Local side (license-check.js): foloseste DOAR cheia publica embedded.

import { base64UrlEncode, base64UrlDecode } from './b64.js';

const HEADER = { alg: 'EdDSA', typ: 'JWT' };
const HEADER_B64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(HEADER)));

// ----------------------------------------------------------------------------
// Key import — PEM PKCS8 (privata) sau SPKI (publica) -> CryptoKey
// ----------------------------------------------------------------------------

function pemToArrayBuffer(pem) {
  const cleaned = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export async function importPrivateKey(pem) {
  return crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(pem),
    { name: 'Ed25519' },
    false,
    ['sign']
  );
}

export async function importPublicKey(pem) {
  return crypto.subtle.importKey(
    'spki',
    pemToArrayBuffer(pem),
    { name: 'Ed25519' },
    false,
    ['verify']
  );
}

// ----------------------------------------------------------------------------
// Sign / verify
// ----------------------------------------------------------------------------

export async function sign(payload, privateKey) {
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(payloadJson));
  const signingInput = `${HEADER_B64}.${payloadB64}`;

  const signatureBuf = await crypto.subtle.sign(
    'Ed25519',
    privateKey,
    new TextEncoder().encode(signingInput)
  );
  const signatureB64 = base64UrlEncode(new Uint8Array(signatureBuf));

  return `${signingInput}.${signatureB64}`;
}

export async function verify(token, publicKey) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signatureB64] = parts;
  const signingInput = `${headerB64}.${payloadB64}`;

  let signature;
  try {
    signature = base64UrlDecode(signatureB64);
  } catch {
    return null;
  }

  const valid = await crypto.subtle.verify(
    'Ed25519',
    publicKey,
    signature,
    new TextEncoder().encode(signingInput)
  );

  if (!valid) return null;

  let payload;
  try {
    const decoded = base64UrlDecode(payloadB64);
    payload = JSON.parse(new TextDecoder().decode(decoded));
  } catch {
    return null;
  }

  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return payload;
}
