#!/usr/bin/env node
/**
 * Generate Ed25519 keypair for licensing JWT signing.
 *
 * Output:
 *   data/keys/jwt-private.pem  →  upload la CF Worker via `wrangler secret put`
 *   data/keys/jwt-public.pem   →  embedded in scripts/license-check.js (constant)
 *
 * Idempotent: refuza sa suprascrie cheile existente. Sterge manual daca rotezi.
 */

import { generateKeyPairSync } from 'node:crypto';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const KEYS_DIR = join(ROOT, 'data', 'keys');
const PRIVATE_PATH = join(KEYS_DIR, 'jwt-private.pem');
const PUBLIC_PATH = join(KEYS_DIR, 'jwt-public.pem');

if (existsSync(PRIVATE_PATH) || existsSync(PUBLIC_PATH)) {
  console.error('Cheile exista deja in data/keys/. Sterge manual daca rotezi.');
  process.exit(1);
}

mkdirSync(KEYS_DIR, { recursive: true });

const { publicKey, privateKey } = generateKeyPairSync('ed25519');

const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const publicPem = publicKey.export({ type: 'spki', format: 'pem' });

writeFileSync(PRIVATE_PATH, privatePem, { mode: 0o600 });
writeFileSync(PUBLIC_PATH, publicPem, { mode: 0o644 });

const publicRaw = publicKey.export({ format: 'der', type: 'spki' });
const publicBase64 = publicRaw.toString('base64');

console.log('OK keys generate:');
console.log(`  privata: ${PRIVATE_PATH}`);
console.log(`  publica: ${PUBLIC_PATH}`);
console.log('');
console.log('Public key (base64 DER, embedded in scripts/license-check.js):');
console.log(publicBase64);
