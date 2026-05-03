import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Walk up from centre/lib/ to find the workspace root.
 * Workspace root is identified by having AGENTS.md or CLAUDE.md.
 */
function findWorkspaceRoot() {
  let dir = resolve(__dirname, '..');
  for (let i = 0; i < 5; i++) {
    if (existsSync(join(dir, 'AGENTS.md')) || existsSync(join(dir, 'CLAUDE.md'))) {
      return dir;
    }
    dir = dirname(dir);
  }
  // Fallback: assume centre is one level inside workspace
  return resolve(__dirname, '../..');
}

export const workspaceRoot = findWorkspaceRoot();
export const dataDir = join(workspaceRoot, 'data');
export const dbPath = join(dataDir, 'robos.db');
export const centreRoot = resolve(__dirname, '..');
