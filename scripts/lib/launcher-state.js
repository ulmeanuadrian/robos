// Launcher state — persistent flags consumed by scripts/robos.js.
// Lives at data/launcher-state.json. Atomic writes; tolerates corruption.
//
// Schema v1:
//   schema_version: number
//   setup_complete: boolean       — true after first successful setup.js run
//   bootstrap_valid: boolean       — true if .env, data/robos.db, centre/dist exist
//   last_robos_version: string     — VERSION at last successful launch
//   dashboard_port: number         — 3001 default; tracked so we can curl-probe
//   first_run_at: ISO timestamp    — when setup ran first time
//   last_launch_at: ISO timestamp  — last time `robos` started successfully
//   shortcut_installed: boolean    — true if PATH/profile shortcut added
//   editor_offered: boolean        — true after first-run editor open/hint (one-shot)
//
// Migration on read: if schema_version < CURRENT, apply patches in-memory + persist.

import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const STATE_PATH = join(ROOT, 'data', 'launcher-state.json');
const STATE_TMP = join(ROOT, 'data', 'launcher-state.json.tmp');

const CURRENT_SCHEMA = 1;

const DEFAULTS = Object.freeze({
  schema_version: CURRENT_SCHEMA,
  setup_complete: false,
  bootstrap_valid: false,
  last_robos_version: null,
  dashboard_port: 3001,
  first_run_at: null,
  last_launch_at: null,
  shortcut_installed: false,
  editor_offered: false,
});

function ensureDataDir() {
  const dataDir = join(ROOT, 'data');
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
}

function migrate(state) {
  let v = state.schema_version || 0;
  while (v < CURRENT_SCHEMA) {
    // Future: per-version patch blocks here
    v += 1;
  }
  state.schema_version = CURRENT_SCHEMA;
  return state;
}

export function read() {
  if (!existsSync(STATE_PATH)) {
    return { ...DEFAULTS };
  }
  try {
    const raw = readFileSync(STATE_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) throw new Error('not an object');
    return migrate({ ...DEFAULTS, ...parsed });
  } catch (err) {
    console.warn(`[launcher-state] corrupt or unreadable, using defaults: ${err.message}`);
    return { ...DEFAULTS };
  }
}

export function write(state) {
  ensureDataDir();
  const merged = migrate({ ...DEFAULTS, ...state });
  const json = JSON.stringify(merged, null, 2) + '\n';
  writeFileSync(STATE_TMP, json, 'utf-8');
  renameSync(STATE_TMP, STATE_PATH);
  return merged;
}

export function update(patch) {
  const current = read();
  return write({ ...current, ...patch });
}

export function reset() {
  return write({ ...DEFAULTS });
}
