// Load .env from workspace root into process.env at server startup.
// Uses our shared env-format.js parser. Idempotent — keys already in
// process.env (set explicitly by the shell or PM2/systemd) take precedence
// over .env values, so operators can still override per-process.
//
// Why we don't use dotenv (npm package): single canonical parser already
// exists in scripts/lib/env-format.js, and we want zero new deps.
//
// Why we don't use `node --env-file=.env`: it requires the flag at every
// invocation site (server, scripts, hooks). Programmatic load is more robust.

import { existsSync } from 'fs';
import { join } from 'path';
import { workspaceRoot } from './config.js';
import { parseEnvFile } from '../../scripts/lib/env-format.js';

let loaded = false;

export function loadEnv({ override = false } = {}) {
  if (loaded) return;
  loaded = true;

  const envPath = join(workspaceRoot, '.env');
  if (!existsSync(envPath)) return;

  const parsed = parseEnvFile(envPath);
  for (const entry of parsed.entries) {
    if (entry.kind !== 'assignment') continue;
    if (!override && Object.prototype.hasOwnProperty.call(process.env, entry.key)) continue;
    process.env[entry.key] = entry.value;
  }
}
