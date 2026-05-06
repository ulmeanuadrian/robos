// Bootstrap validity check — verifies the install has all critical files.
// Returns { valid: boolean, missing: string[] }.
//
// Used by scripts/robos.js to decide whether to run setup or auto-repair silently.

import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const REQUIRED = [
  '.env',
  'centre/package.json',
  'centre/dist/index.html',
  'data/robos.db',
  'skills/_index.json',
  'context/SOUL.md',
];

export function checkBootstrap() {
  const missing = REQUIRED.filter((rel) => !existsSync(join(ROOT, rel)));
  return { valid: missing.length === 0, missing, root: ROOT };
}
