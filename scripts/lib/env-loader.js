// scripts/lib/env-loader.js — Idempotent .env loader pentru hook scripts si cron jobs.
//
// De ce: Claude Code spawneaza hooks-urile cu env curat. Cron jobs ruleaza prin
// scheduler care nu inherits .env-ul proiectului. Toggle-urile documentate
// (ROBOS_CHECKPOINT_DISABLED, ROBOS_LOOP_DETECTOR_DISABLED, etc.) trebuie sa
// functioneze cand sunt setate in .env, nu doar cand sunt deja in process.env.
//
// Comportament:
//   - Citeste ROBOS_ROOT/.env (path resolvat din locatia acestui modul)
//   - Parser minimal: KEY=value, ignora comentarii (#) si linii vide
//   - Nu suprascrie valorile existente in process.env (caller wins)
//   - Idempotent (a 2-a invocare e no-op)
//   - Graceful pe missing/unreadable file (silent skip)
//
// Cross-platform:
//   - import.meta.url + fileURLToPath: stable Mac+Windows
//   - readFileSync cu 'utf-8' explicit
//   - \r?\n split: CRLF + LF safe
//   - Strip BOM in primul char (Windows editors ocazional)

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
// scripts/lib/env-loader.js → ../../ = ROBOS_ROOT
const ROBOS_ROOT = resolve(dirname(__filename), '..', '..');

let _loaded = false;

/**
 * Load .env into process.env. Idempotent. Caller-set env wins.
 * @param {Object} [opts]
 * @param {string} [opts.rootDir] - override default ROBOS_ROOT
 * @returns {{ loaded: boolean, keys: number, path: string }} status info
 */
export function loadEnv(opts = {}) {
  const rootDir = opts.rootDir || ROBOS_ROOT;
  const envPath = join(rootDir, '.env');

  if (_loaded && !opts.rootDir) {
    return { loaded: false, keys: 0, path: envPath, reason: 'already-loaded' };
  }

  if (!existsSync(envPath)) {
    if (!opts.rootDir) _loaded = true; // mark loaded even on missing, to avoid re-checking
    return { loaded: false, keys: 0, path: envPath, reason: 'missing' };
  }

  let content;
  try {
    content = readFileSync(envPath, 'utf-8');
    // Strip BOM if present (Windows editors)
    if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
  } catch (err) {
    if (!opts.rootDir) _loaded = true;
    return { loaded: false, keys: 0, path: envPath, reason: 'unreadable', error: err.message };
  }

  let keysSet = 0;
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eqIdx = line.indexOf('=');
    if (eqIdx < 1) continue; // need a key

    const key = line.slice(0, eqIdx).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue; // valid env-var name

    let value = line.slice(eqIdx + 1).trim();
    // Strip optional surrounding quotes (preserve content)
    if (value.length >= 2) {
      const first = value[0];
      const last = value[value.length - 1];
      if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
        value = value.slice(1, -1);
      }
    }

    // Caller wins — don't overwrite values set by parent process
    if (process.env[key] === undefined) {
      process.env[key] = value;
      keysSet++;
    }
  }

  if (!opts.rootDir) _loaded = true;
  return { loaded: true, keys: keysSet, path: envPath };
}

/**
 * Reset internal state. For tests only — production code should not call this.
 */
export function _resetForTests() {
  _loaded = false;
}
