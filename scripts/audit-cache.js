#!/usr/bin/env node
/**
 * audit-cache.js
 *
 * Helper pentru sys-audit: calculeaza hash-ul mtime al input-urilor,
 * citeste/scrie data/audit-cache.json, decide hit/miss.
 *
 * Folosire:
 *   node scripts/audit-cache.js hash      # printeaza hash-ul curent
 *   node scripts/audit-cache.js status    # arata daca cache-ul e fresh
 *   node scripts/audit-cache.js clear     # sterge cache-ul
 */

import { readdirSync, readFileSync, writeFileSync, statSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROBOS_ROOT = join(__dirname, '..');
const CACHE_FILE = join(ROBOS_ROOT, 'data', 'audit-cache.json');
const TTL_MS = 24 * 60 * 60 * 1000;

const INPUT_FILES = [
  'context/USER.md',
  'brand/voice.md',
  'brand/audience.md',
  'brand/positioning.md',
  'brand/samples.md',
  'context/priorities.md',
  'connections.md',
  'context/learnings.md',
  '.env',
];

const INPUT_DIRS = [
  'skills',
  'cron/jobs',
  'context/memory',
  'context/audits',
];

function fileFingerprint(relPath) {
  const abs = join(ROBOS_ROOT, relPath);
  if (!existsSync(abs)) return `missing:${relPath}`;
  try {
    const stat = statSync(abs);
    return `${relPath}:${stat.mtime.toISOString()}`;
  } catch {
    return `error:${relPath}`;
  }
}

function dirFingerprint(relPath) {
  const abs = join(ROBOS_ROOT, relPath);
  if (!existsSync(abs)) return `missing:${relPath}`;
  try {
    const entries = readdirSync(abs).sort();
    return `${relPath}:[${entries.length}]:${entries.join(',')}`;
  } catch {
    return `error:${relPath}`;
  }
}

export function computeHash() {
  const parts = [
    ...INPUT_FILES.map(fileFingerprint),
    ...INPUT_DIRS.map(dirFingerprint),
  ];
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

export function readCache() {
  if (!existsSync(CACHE_FILE)) return null;
  try {
    return JSON.parse(readFileSync(CACHE_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

export function writeCache(payload) {
  mkdirSync(dirname(CACHE_FILE), { recursive: true });
  const data = {
    ...payload,
    computed_at: new Date().toISOString(),
    input_hash: computeHash(),
  };
  writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  return data;
}

export function checkStatus() {
  const cache = readCache();
  if (!cache) return { status: 'miss', reason: 'fara cache' };

  const currentHash = computeHash();
  if (cache.input_hash !== currentHash) {
    return { status: 'miss', reason: 'input-uri modificate', cache };
  }

  const age = Date.now() - new Date(cache.computed_at).getTime();
  if (age > TTL_MS) {
    return { status: 'miss', reason: `expirat (${Math.round(age / 3600000)}h)`, cache };
  }

  return { status: 'hit', cache, age_ms: age };
}

// CLI
const cmd = process.argv[2];
switch (cmd) {
  case 'hash': {
    console.log(computeHash());
    break;
  }
  case 'status': {
    const s = checkStatus();
    // --json: machine-readable for skills / dashboards
    if (process.argv.includes('--json')) {
      console.log(JSON.stringify(s));
      break;
    }
    if (s.status === 'hit') {
      console.log(`HIT: scor ${s.cache.score}/100, varsta ${Math.round(s.age_ms / 60000)}min`);
    } else {
      console.log(`MISS: ${s.reason}`);
    }
    break;
  }
  case 'clear': {
    if (existsSync(CACHE_FILE)) {
      unlinkSync(CACHE_FILE);
      console.log(`Sters: ${CACHE_FILE}`);
    } else {
      console.log('Cache deja absent');
    }
    break;
  }
  default: {
    if (cmd) {
      console.error(`Comanda necunoscuta: ${cmd}`);
      console.error('Folosire: node scripts/audit-cache.js [hash|status|clear]');
      process.exit(1);
    }
    // No command: just print status
    const s = checkStatus();
    console.log(JSON.stringify(s, null, 2));
  }
}
