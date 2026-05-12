#!/usr/bin/env node
// rehash-validators.js — regenereaza tabela de integritate din license-validator.js.
//
// CAND sa rulezi:
//   - Dupa orice modificare la unul din fisierele-peer (license-check.js,
//     hook-user-prompt.js, centre/server.js, setup.js, update.js)
//   - Dupa orice modificare la license-validator.js insusi
//   - Inainte de release (poate fi pus ca prepublishOnly in package.json)
//
// Ce face:
//   1. Hashuieste continutul fiecarui peer (cu marker "robos:i" stripped)
//   2. Injecteaza hash-urile in tabela MANIFEST din license-validator.js
//   3. Hashuieste validator-ul modificat → SELF hash
//   4. Injecteaza SELF in MANIFEST.self
//   5. Scrie validator-ul final
//
// Exit: 0 verde, 1 daca un peer lipseste sau scrierea esueaza.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MARKER = 'robos:i';
const VALIDATOR_PATH = join(ROOT, 'scripts', 'lib', 'license-validator.js');

const PEERS = [
  'scripts/license-check.js',
  'scripts/hook-user-prompt.js',
  'centre/server.js',
  'scripts/setup.js',
  'scripts/update.js',
];

function hashContent(content) {
  const stripped = content
    .split('\n')
    .filter((l) => !l.includes(MARKER))
    .join('\n');
  return createHash('sha256').update(stripped).digest('hex');
}

function hashFile(abs) {
  return hashContent(readFileSync(abs, 'utf-8'));
}

function escRegex(s) {
  return s.replace(/[/\\^$.*+?()[\]{}|]/g, '\\$&');
}

// 1. Compute peer hashes
const peerHashes = {};
let missing = 0;
for (const rel of PEERS) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) {
    console.error(`[FAIL] peer lipsa: ${rel}`);
    missing++;
    continue;
  }
  peerHashes[rel] = hashFile(abs);
}
if (missing > 0) {
  console.error(`\n${missing} peer(s) lipsa — abandonez rehash.`);
  process.exit(1);
}

// 2. Inject peer hashes into validator
let validator = readFileSync(VALIDATOR_PATH, 'utf-8');
for (const [rel, h] of Object.entries(peerHashes)) {
  const re = new RegExp(`('${escRegex(rel)}':\\s*)'[^']*'`, 'g');
  if (!re.test(validator)) {
    console.error(`[FAIL] nu gasesc slot pentru ${rel} in license-validator.js`);
    process.exit(1);
  }
  // Reset lastIndex pentru replace global
  validator = validator.replace(
    new RegExp(`('${escRegex(rel)}':\\s*)'[^']*'`, 'g'),
    `$1'${h}'`
  );
}

// 3. Compute self hash on the freshly-injected validator content
const selfHash = hashContent(validator);

// 4. Inject self hash
const selfRe = /(self:\s*)'[^']*'/;
if (!selfRe.test(validator)) {
  console.error('[FAIL] nu gasesc slot pentru self hash in license-validator.js');
  process.exit(1);
}
validator = validator.replace(selfRe, `$1'${selfHash}'`);

// 5. Write back
writeFileSync(VALIDATOR_PATH, validator);

console.log('[OK] rehash complete');
console.log(`  self: ${selfHash.slice(0, 12)}...`);
for (const [rel, h] of Object.entries(peerHashes)) {
  console.log(`  ${rel}: ${h.slice(0, 12)}...`);
}
