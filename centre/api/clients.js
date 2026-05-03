import { readdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { workspaceRoot } from '../lib/config.js';

/**
 * GET /api/clients — list client directories
 */
export function listClients() {
  const clientsDir = join(workspaceRoot, 'clients');
  if (!existsSync(clientsDir)) return [];

  const entries = readdirSync(clientsDir, { withFileTypes: true });

  return entries
    .filter(e => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_'))
    .map(e => {
      const slug = e.name;
      let name = slug;

      // Try to read a manifest or README for a display name
      const manifestPath = join(clientsDir, slug, '_metadata.json');
      if (existsSync(manifestPath)) {
        try {
          const meta = JSON.parse(readFileSync(manifestPath, 'utf-8'));
          name = meta.name || meta.displayName || slug;
        } catch {
          // ignore
        }
      }

      return { slug, name };
    });
}
