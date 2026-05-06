-- Second Brain: atomic notes + FTS5 index + auto-capture candidate buffer.
-- Markdown remains canonical source of truth (context/notes/, context/memory/, etc.).
-- This schema is a derived index — rebuilt safely from markdown by scripts/notes-index.js.

-- Atomic notes: one row per markdown file scanned by the indexer.
-- `id` is the stable frontmatter id (e.g. "note-2026-05-06-1430-7f3a").
-- `path` is workspace-relative for portability across machines.
-- `source` distinguishes user-authored notes from imported memory/learnings/audits.
CREATE TABLE IF NOT EXISTS notes (
  id           TEXT PRIMARY KEY,
  path         TEXT NOT NULL UNIQUE,
  title        TEXT,
  body         TEXT NOT NULL DEFAULT '',
  tags         TEXT NOT NULL DEFAULT '',          -- space-separated for FTS5; structured copy in note_tags
  source       TEXT NOT NULL DEFAULT 'note'       -- 'note' | 'memory' | 'learnings' | 'audit' | 'project'
                 CHECK (source IN ('note','memory','learnings','audit','project')),
  frontmatter  TEXT NOT NULL DEFAULT '{}',        -- raw frontmatter as JSON
  mtime_ms     INTEGER NOT NULL DEFAULT 0,
  size_bytes   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS notes_source_idx ON notes(source);
CREATE INDEX IF NOT EXISTS notes_mtime_idx  ON notes(mtime_ms);

-- FTS5 virtual table: ranks results by BM25, returns excerpts via highlight()/snippet().
-- `content=notes` makes it an external-content index, so the source of truth stays
-- in `notes` and FTS only stores tokenized data.
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  title,
  body,
  tags,
  content='notes',
  content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2'
);

-- Triggers keep FTS5 in sync with notes (insert/update/delete).
CREATE TRIGGER IF NOT EXISTS notes_fts_ai AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts(rowid, title, body, tags)
  VALUES (new.rowid, new.title, new.body, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS notes_fts_ad AFTER DELETE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, body, tags)
  VALUES ('delete', old.rowid, old.title, old.body, old.tags);
END;

CREATE TRIGGER IF NOT EXISTS notes_fts_au AFTER UPDATE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, body, tags)
  VALUES ('delete', old.rowid, old.title, old.body, old.tags);
  INSERT INTO notes_fts(rowid, title, body, tags)
  VALUES (new.rowid, new.title, new.body, new.tags);
END;

-- Structured tag table for filtered queries (e.g. "all notes tagged #decision").
CREATE TABLE IF NOT EXISTS note_tags (
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  tag     TEXT NOT NULL,
  PRIMARY KEY (note_id, tag)
);

CREATE INDEX IF NOT EXISTS note_tags_tag_idx ON note_tags(tag);

-- Wiki-link graph between notes ([[id]] or [[title]] resolved during indexing).
CREATE TABLE IF NOT EXISTS note_links (
  src_id    TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  dst_id    TEXT,                                  -- null if link unresolved
  link_text TEXT NOT NULL,
  PRIMARY KEY (src_id, link_text)
);

CREATE INDEX IF NOT EXISTS note_links_dst_idx ON note_links(dst_id);

-- Auto-capture candidates buffer.
-- The Stop hook detects decision/rule fragments from session turns and writes here.
-- User confirms or rejects in batch at next session start.
-- `status`: pending → confirmed (promoted to a real note) | rejected (kept for heuristic learning).
CREATE TABLE IF NOT EXISTS note_candidates (
  id           TEXT PRIMARY KEY,                   -- e.g. "cand-2026-05-06-1430-3f2b"
  detected_at  TEXT NOT NULL DEFAULT (datetime('now')),
  session_id   TEXT,
  trigger      TEXT NOT NULL,                      -- pattern that fired ("decid:", "regula:", etc.)
  excerpt      TEXT NOT NULL,                      -- the captured fragment
  context_url  TEXT,                               -- optional: link to memory file / line
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','confirmed','rejected','expired')),
  reviewed_at  TEXT,
  promoted_to  TEXT REFERENCES notes(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS note_candidates_status_idx ON note_candidates(status);
CREATE INDEX IF NOT EXISTS note_candidates_detected_idx ON note_candidates(detected_at);

-- Update schema version
INSERT OR REPLACE INTO schema_version (version) VALUES (4);
