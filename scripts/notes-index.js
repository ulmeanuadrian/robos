#!/usr/bin/env node
/**
 * notes-index.js
 *
 * Walks markdown files across the workspace and upserts them into the SQLite
 * second-brain tables (notes, note_tags, note_links). Markdown stays canonical;
 * this index is a derived cache rebuilt safely from disk.
 *
 * Scopes scanned by default:
 *   - context/notes/...     (source: 'note')      atomic notes authored explicitly
 *   - context/memory/*.md   (source: 'memory')    daily journals (skip _archive/)
 *   - context/learnings.md  (source: 'learnings') feedback log
 *   - context/audits/*.md   (source: 'audit')     4C audit history
 *
 * Idempotent: skips files whose mtime matches DB (unless --rebuild). Safe to run
 * repeatedly. Atomic per-file (one transaction per file → no partial state).
 *
 * CLI:
 *   node scripts/notes-index.js                    # incremental over default scopes
 *   node scripts/notes-index.js --rebuild          # ignore mtime, reindex everything
 *   node scripts/notes-index.js --dry-run          # report what would change, no writes
 *   node scripts/notes-index.js --file <path>      # index just one file (used by capture skill)
 *   node scripts/notes-index.js --scope <dir>      # restrict to a single subtree
 */

import { readFileSync, existsSync, statSync, readdirSync } from 'fs';
import { join, relative, dirname, basename, extname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import { getDb, closeDb } from '../centre/lib/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROBOS_ROOT = join(__dirname, '..');

const DEFAULT_SCOPES = [
  { dir: 'context/notes',    source: 'note',      pattern: /\.md$/i },
  { dir: 'context/memory',   source: 'memory',    pattern: /^\d{4}-\d{2}-\d{2}\.md$/i, skipDirs: ['_archive'] },
  { dir: 'context/audits',   source: 'audit',     pattern: /\.md$/i },
];
// Single file (not a directory walk).
const SINGLE_FILES = [
  { path: 'context/learnings.md', source: 'learnings' },
];

// ---------- Markdown parsing ----------

/**
 * Extract YAML frontmatter (between leading `---\n...\n---`) and return
 * { fm: object, body: string }. Handles scalars, quoted scalars, block arrays.
 * Unknown fields are kept as strings; empty values become empty arrays only
 * when followed by indented `- item` lines.
 */
function parseFrontmatter(content) {
  const normalized = content.replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { fm: {}, body: normalized };

  const fm = {};
  const lines = match[1].split('\n');
  let currentKey = null;
  for (const line of lines) {
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    const arrItem = line.match(/^\s+-\s+"?(.*?)"?\s*$/);
    if (kv) {
      currentKey = kv[1];
      const raw = kv[2].trim().replace(/^["']|["']$/g, '');
      fm[currentKey] = raw === '' ? [] : raw;
    } else if (arrItem && currentKey) {
      if (!Array.isArray(fm[currentKey])) fm[currentKey] = [];
      fm[currentKey].push(arrItem[1]);
    }
  }
  return { fm, body: match[2] };
}

/**
 * Extract a usable title:
 *   1. frontmatter.title
 *   2. first ATX `# heading`
 *   3. filename without extension
 */
function extractTitle(fm, body, filePath) {
  if (typeof fm.title === 'string' && fm.title.trim()) return fm.title.trim();
  const h1 = body.match(/^\s*#\s+(.+?)\s*$/m);
  if (h1) return h1[1].trim();
  return basename(filePath, extname(filePath));
}

/**
 * Extract tags from frontmatter.tags (array or comma string) AND inline `#tag`
 * tokens in the body. Inline tags must follow whitespace or BOL and be
 * alphanumeric (with `-` or `_`) — heading anchors `#` and code blocks are
 * excluded by stripping fenced blocks first.
 */
function extractTags(fm, body) {
  const out = new Set();
  if (Array.isArray(fm.tags)) {
    fm.tags.forEach((t) => out.add(String(t).replace(/^#/, '').trim()));
  } else if (typeof fm.tags === 'string' && fm.tags.trim()) {
    fm.tags.split(',').forEach((t) => out.add(t.replace(/^#/, '').trim()));
  }

  const stripped = body.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');
  // Match #tag where preceded by whitespace/BOL, NOT a heading marker.
  // Heuristic: ATX heading lines start with `#` at line start — exclude them.
  for (const line of stripped.split('\n')) {
    if (/^\s*#{1,6}\s+/.test(line)) continue;
    const matches = line.matchAll(/(?:^|\s)#([\p{L}\p{N}][\p{L}\p{N}_-]{1,63})/gu);
    for (const m of matches) out.add(m[1].toLowerCase());
  }
  return [...out].filter(Boolean);
}

/**
 * Extract `[[wiki-link]]` references from the body. Used to populate note_links
 * for backlink queries. Targets are either a stable note id (`[[note-...]]`)
 * or a free-form title resolved at query time.
 */
function extractLinks(body) {
  const out = new Set();
  const stripped = body.replace(/```[\s\S]*?```/g, '');
  for (const m of stripped.matchAll(/\[\[([^\]\n|]+)(?:\|[^\]\n]+)?\]\]/g)) {
    const target = m[1].trim();
    if (target) out.add(target);
  }
  return [...out];
}

/**
 * Stable id derivation:
 *   1. frontmatter.id wins (lets human-authored notes keep ids on rename)
 *   2. else: deterministic hash of workspace-relative path → "auto-{8-hex}"
 */
function deriveId(fm, relPath) {
  if (typeof fm.id === 'string' && /^[A-Za-z0-9_-]{3,128}$/.test(fm.id.trim())) {
    return fm.id.trim();
  }
  const h = createHash('sha1').update(relPath.replace(/\\/g, '/')).digest('hex').slice(0, 8);
  return `auto-${h}`;
}

// ---------- File walking ----------

function walkDir(dir, pattern, skipDirs = []) {
  const out = [];
  if (!existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try { entries = readdirSync(cur, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const full = join(cur, e.name);
      if (e.isDirectory()) {
        if (skipDirs.includes(e.name)) continue;
        if (e.name.startsWith('.')) continue;
        stack.push(full);
      } else if (e.isFile() && pattern.test(e.name)) {
        out.push(full);
      }
    }
  }
  return out;
}

// ---------- Indexing ----------

function indexFile(db, absPath, source, opts) {
  const relPath = relative(ROBOS_ROOT, absPath).replace(/\\/g, '/');
  let st;
  try { st = statSync(absPath); } catch { return { skipped: true, reason: 'stat-failed' }; }

  const mtimeMs = Math.floor(st.mtimeMs);
  const sizeBytes = st.size;

  if (!opts.rebuild) {
    const existing = db.prepare('SELECT mtime_ms FROM notes WHERE path = ?').get(relPath);
    if (existing && existing.mtime_ms === mtimeMs) {
      return { skipped: true, reason: 'unchanged' };
    }
  }

  const content = readFileSync(absPath, 'utf-8');
  const { fm, body } = parseFrontmatter(content);
  const id = deriveId(fm, relPath);
  const title = extractTitle(fm, body, absPath);
  const tags = extractTags(fm, body);
  const links = extractLinks(body);

  if (opts.dryRun) {
    return {
      skipped: false,
      dryRun: true,
      id,
      path: relPath,
      title,
      source,
      tagCount: tags.length,
      linkCount: links.length,
    };
  }

  const upsert = db.transaction(() => {
    db.prepare(`
      INSERT INTO notes (id, path, title, body, tags, source, frontmatter, mtime_ms, size_bytes, updated_at)
      VALUES (@id, @path, @title, @body, @tags, @source, @frontmatter, @mtime_ms, @size_bytes, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        path        = excluded.path,
        title       = excluded.title,
        body        = excluded.body,
        tags        = excluded.tags,
        source      = excluded.source,
        frontmatter = excluded.frontmatter,
        mtime_ms    = excluded.mtime_ms,
        size_bytes  = excluded.size_bytes,
        updated_at  = datetime('now')
    `).run({
      id,
      path: relPath,
      title,
      body,
      tags: tags.join(' '),
      source,
      frontmatter: JSON.stringify(fm),
      mtime_ms: mtimeMs,
      size_bytes: sizeBytes,
    });

    db.prepare('DELETE FROM note_tags WHERE note_id = ?').run(id);
    const insTag = db.prepare('INSERT OR IGNORE INTO note_tags (note_id, tag) VALUES (?, ?)');
    for (const t of tags) insTag.run(id, t);

    db.prepare('DELETE FROM note_links WHERE src_id = ?').run(id);
    const insLink = db.prepare(`
      INSERT OR IGNORE INTO note_links (src_id, dst_id, link_text)
      VALUES (?, ?, ?)
    `);
    // Resolve link targets: if target matches an existing note id, store it; else null.
    const resolveStmt = db.prepare('SELECT id FROM notes WHERE id = ? OR title = ?');
    for (const lt of links) {
      const row = resolveStmt.get(lt, lt);
      insLink.run(id, row ? row.id : null, lt);
    }
  });

  upsert();
  return { skipped: false, id, path: relPath, title };
}

function indexSingleFile(db, relPath, opts) {
  const matched = SINGLE_FILES.find((s) => s.path === relPath)
    || DEFAULT_SCOPES.find((s) => relPath.startsWith(s.dir + '/') || relPath.startsWith(s.dir + '\\'));
  const source = matched ? matched.source : 'note';
  const abs = join(ROBOS_ROOT, relPath);
  if (!existsSync(abs)) {
    return { error: `not found: ${relPath}` };
  }
  return indexFile(db, abs, source, opts);
}

function runScan(opts) {
  const db = getDb();
  const stats = { scanned: 0, indexed: 0, skipped: 0, errors: 0 };
  const dryRunRows = [];

  const targets = opts.scope
    ? DEFAULT_SCOPES.filter((s) => s.dir === opts.scope)
    : DEFAULT_SCOPES;

  for (const sc of targets) {
    const absDir = join(ROBOS_ROOT, sc.dir);
    const files = walkDir(absDir, sc.pattern, sc.skipDirs || []);
    for (const f of files) {
      stats.scanned++;
      try {
        const r = indexFile(db, f, sc.source, opts);
        if (r.skipped) stats.skipped++;
        else {
          stats.indexed++;
          if (opts.dryRun) dryRunRows.push(r);
        }
      } catch (e) {
        stats.errors++;
        process.stderr.write(`[notes-index] error on ${f}: ${e.message}\n`);
      }
    }
  }

  if (!opts.scope) {
    for (const sf of SINGLE_FILES) {
      const abs = join(ROBOS_ROOT, sf.path);
      if (!existsSync(abs)) continue;
      stats.scanned++;
      try {
        const r = indexFile(db, abs, sf.source, opts);
        if (r.skipped) stats.skipped++;
        else {
          stats.indexed++;
          if (opts.dryRun) dryRunRows.push(r);
        }
      } catch (e) {
        stats.errors++;
        process.stderr.write(`[notes-index] error on ${abs}: ${e.message}\n`);
      }
    }
  }

  return { stats, dryRunRows };
}

function parseArgs(argv) {
  const opts = { dryRun: false, rebuild: false, scope: null, file: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--rebuild') opts.rebuild = true;
    else if (a === '--scope') opts.scope = argv[++i];
    else if (a === '--file') opts.file = argv[++i];
    else if (a === '--help' || a === '-h') {
      process.stdout.write(
        'Usage: notes-index.js [--rebuild] [--dry-run] [--scope <dir>] [--file <path>]\n'
      );
      process.exit(0);
    }
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv);

  if (opts.file) {
    const db = getDb();
    const r = indexSingleFile(db, opts.file.replace(/\\/g, '/'), opts);
    closeDb();
    process.stdout.write(JSON.stringify(r) + '\n');
    process.exit(r.error ? 1 : 0);
  }

  const { stats, dryRunRows } = runScan(opts);
  closeDb();

  const summary = {
    mode: opts.dryRun ? 'dry-run' : (opts.rebuild ? 'rebuild' : 'incremental'),
    ...stats,
  };
  process.stdout.write(JSON.stringify(summary) + '\n');
  if (opts.dryRun && dryRunRows.length) {
    for (const r of dryRunRows.slice(0, 20)) {
      process.stdout.write(`  + ${r.source.padEnd(10)} ${r.path}  [${r.tagCount}t/${r.linkCount}l]\n`);
    }
    if (dryRunRows.length > 20) process.stdout.write(`  ... ${dryRunRows.length - 20} more\n`);
  }
  process.exit(stats.errors ? 1 : 0);
}

main();
