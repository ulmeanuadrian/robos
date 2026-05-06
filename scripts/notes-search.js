#!/usr/bin/env node
/**
 * notes-search.js
 *
 * FTS5 full-text search over the second-brain index. Returns BM25-ranked
 * matches with file path, title, and a snippet of context around the hit.
 *
 * CLI:
 *   node scripts/notes-search.js "query string"
 *   node scripts/notes-search.js "query" --limit 10
 *   node scripts/notes-search.js "query" --source memory      # filter by source
 *   node scripts/notes-search.js "query" --tag decision       # filter by tag
 *   node scripts/notes-search.js "query" --json               # JSON output (for skills)
 *
 * Query syntax: FTS5 standard (`word1 word2`, `"exact phrase"`, `prefix*`,
 * `word1 OR word2`, `word1 NOT word2`). Diacritics are stripped (tokenizer
 * uses `remove_diacritics 2`), so `salut` matches `salut` and `salutã`.
 *
 * Exit codes: 0 always (no results is not an error). Errors print to stderr.
 */

import { getDb, closeDb } from '../centre/lib/db.js';

const HELP = `Usage: notes-search.js <query> [--limit N] [--source X] [--tag T] [--json]

Examples:
  notes-search.js "SQLite FTS5"
  notes-search.js "decizie OR regula" --limit 5
  notes-search.js "auth" --source memory --json
`;

function parseArgs(argv) {
  const opts = { query: null, limit: 10, source: null, tag: null, json: false };
  const positional = [];
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--limit') opts.limit = Math.max(1, Math.min(50, parseInt(argv[++i], 10) || 10));
    else if (a === '--source') opts.source = argv[++i];
    else if (a === '--tag') opts.tag = argv[++i];
    else if (a === '--json') opts.json = true;
    else if (a === '--help' || a === '-h') { process.stdout.write(HELP); process.exit(0); }
    else positional.push(a);
  }
  opts.query = positional.join(' ').trim();
  return opts;
}

/**
 * FTS5's MATCH operator throws on syntax errors (unbalanced quotes, lone
 * operators). The user types free text; we sanitize to a safe query:
 *   - Drop characters FTS5 treats as operators except `*`, quotes, OR/NOT
 *   - Wrap stray quotes by stripping unmatched ones
 */
function sanitizeQuery(q) {
  if (!q) return '';
  // Strip control chars and disallowed punctuation. Keep letters/digits/spaces,
  // plus `* " ' - _ /` which FTS5 handles fine.
  let cleaned = q.replace(/[^\p{L}\p{N}\s*"'_/.\-]/gu, ' ');
  // Balance double quotes.
  const quoteCount = (cleaned.match(/"/g) || []).length;
  if (quoteCount % 2 === 1) cleaned = cleaned.replace(/"/g, '');
  return cleaned.replace(/\s+/g, ' ').trim();
}

function search(opts) {
  const db = getDb();
  const safe = sanitizeQuery(opts.query);
  if (!safe) {
    closeDb();
    return { results: [], note: 'empty query after sanitization' };
  }

  // Build query. FTS5 returns matchinfo via bm25(). Lower bm25 = better, so
  // ORDER BY bm25 ascending. Snippet shows up to 12 tokens around match
  // with ellipsis markers.
  const filters = [];
  const params = { q: safe, limit: opts.limit };
  if (opts.source) {
    filters.push('n.source = @source');
    params.source = opts.source;
  }
  if (opts.tag) {
    filters.push('EXISTS (SELECT 1 FROM note_tags t WHERE t.note_id = n.id AND t.tag = @tag)');
    params.tag = opts.tag.replace(/^#/, '');
  }
  const whereExtra = filters.length ? `AND ${filters.join(' AND ')}` : '';

  const rows = db.prepare(`
    SELECT
      n.id,
      n.path,
      n.title,
      n.source,
      n.tags,
      bm25(notes_fts) AS rank,
      snippet(notes_fts, 1, '«', '»', '…', 16) AS excerpt
    FROM notes_fts
    JOIN notes n ON n.rowid = notes_fts.rowid
    WHERE notes_fts MATCH @q ${whereExtra}
    ORDER BY rank
    LIMIT @limit
  `).all(params);

  closeDb();
  return { results: rows, query: safe };
}

function formatHuman(results, query) {
  if (results.length === 0) {
    return `Niciun rezultat pentru "${query}".`;
  }
  const lines = [`${results.length} rezultate pentru "${query}":`];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const tags = r.tags ? `  [${r.tags.split(' ').filter(Boolean).map(t => '#' + t).join(' ')}]` : '';
    lines.push(`\n${i + 1}. ${r.title || '(no title)'}  (${r.source})${tags}`);
    lines.push(`   ${r.path}`);
    if (r.excerpt) lines.push(`   ${r.excerpt.replace(/\s+/g, ' ').trim()}`);
  }
  return lines.join('\n');
}

function main() {
  const opts = parseArgs(process.argv);
  if (!opts.query) {
    process.stderr.write(HELP);
    process.exit(2);
  }

  let result;
  try {
    result = search(opts);
  } catch (e) {
    process.stderr.write(`[notes-search] ${e.message}\n`);
    process.exit(1);
  }

  if (opts.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    process.stdout.write(formatHuman(result.results, result.query) + '\n');
  }
  process.exit(0);
}

main();
