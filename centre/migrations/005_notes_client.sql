-- Per-client scoping for second-brain notes.
-- Adds optional `client_slug` column to `notes` so search can filter by the
-- client whose folder the markdown lives in. NULL = root workspace note.
--
-- The indexer (scripts/notes-index.js) derives the slug from the file path:
--   clients/<slug>/...    → client_slug = '<slug>'
--   anything else         → client_slug = NULL (root)
--
-- The search CLI (scripts/notes-search.js) defaults to filtering by the
-- currently-active client (data/active-client.json). `--all-clients` overrides.

ALTER TABLE notes ADD COLUMN client_slug TEXT;

CREATE INDEX IF NOT EXISTS notes_client_slug_idx ON notes(client_slug);

INSERT OR REPLACE INTO schema_version (version) VALUES (5);
