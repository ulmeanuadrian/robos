import { readdirSync, readFileSync, statSync, existsSync } from 'fs';
import { join, resolve, relative } from 'path';
import { workspaceRoot } from '../lib/config.js';

/** Directories to show in the file browser */
const BROWSABLE = ['context', 'brand', 'projects', 'skills', 'cron', 'clients'];
/** Top-level files to show */
const BROWSABLE_FILES = ['CLAUDE.md', 'AGENTS.md', 'connections.md'];

/**
 * Files and path prefixes that must NEVER be readable via the API,
 * even if they sit inside the workspace root. These hold credentials,
 * server config, or runtime state that has no place in the dashboard
 * file viewer.
 */
const DENIED_PATHS = new Set([
  '.env',
  '.env.local',
  '.env.production',
  '.mcp.json',
]);
const DENIED_PREFIXES = [
  '.claude/',
  '.command-centre/',
  'data/',
  'node_modules/',
  '.git/',
];

function isDenied(normalized) {
  if (DENIED_PATHS.has(normalized)) return true;
  // Normalize Windows separators before prefix check
  const unix = normalized.replace(/\\/g, '/');
  return DENIED_PREFIXES.some((p) => unix === p.replace(/\/$/, '') || unix.startsWith(p));
}

/**
 * Recursively build a file tree for a directory.
 */
function buildTree(dir, relPath, maxDepth = 4) {
  if (maxDepth <= 0) return [];

  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    // S11 fix: skip names with path-traversal or separator characters. Belt-
    // and-braces — readFile already enforces sandboxing via path.relative, but
    // the tree listing should not expose entries that could confuse downstream
    // callers. Real filesystems reject these names natively, but NTFS reparse
    // points / junctions could approximate.
    .filter(e => !e.name.startsWith('.') && !e.name.includes('/') && !e.name.includes('\\') && !e.name.includes('\0'))
    .sort((a, b) => {
      // Directories first
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    })
    .map(entry => {
      const entryRelPath = relPath ? `${relPath}/${entry.name}` : entry.name;
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        return {
          name: entry.name,
          path: entryRelPath,
          type: 'directory',
          children: buildTree(fullPath, entryRelPath, maxDepth - 1),
        };
      }

      return {
        name: entry.name,
        path: entryRelPath,
        type: 'file',
      };
    });
}

/**
 * GET /api/files — list the workspace file tree
 */
export function listFiles() {
  const tree = [];

  // Add browsable directories
  for (const dirName of BROWSABLE) {
    const dirPath = join(workspaceRoot, dirName);
    if (existsSync(dirPath)) {
      tree.push({
        name: dirName,
        path: dirName,
        type: 'directory',
        children: buildTree(dirPath, dirName),
      });
    }
  }

  // Add top-level files
  for (const fileName of BROWSABLE_FILES) {
    const filePath = join(workspaceRoot, fileName);
    if (existsSync(filePath)) {
      tree.push({
        name: fileName,
        path: fileName,
        type: 'file',
      });
    }
  }

  return tree;
}

/**
 * GET /api/files?path=... — read a file's content
 * Returns { content, path } or null if not found.
 */
export function readFile(relPath) {
  const normalized = relPath.replace(/^\/+/, '');
  const fullPath = resolve(workspaceRoot, normalized);
  const rel = relative(workspaceRoot, fullPath);

  // Security: reject any path that escapes workspace
  if (rel.startsWith('..') || rel.startsWith('/')) {
    return null;
  }

  // Security: deny credential / runtime-state paths even inside workspace
  if (isDenied(normalized)) {
    return null;
  }

  if (!existsSync(fullPath)) {
    return null;
  }

  try {
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      // Return directory listing
      return buildTree(fullPath, normalized);
    }

    // Only read text files under 1MB
    if (stat.size > 1024 * 1024) {
      return { content: '[File too large to display]', path: normalized };
    }

    const content = readFileSync(fullPath, 'utf-8');
    return { content, path: normalized };
  } catch {
    return null;
  }
}
