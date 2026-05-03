import Database from 'better-sqlite3';
import { readFileSync, readdirSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { dbPath, dataDir, centreRoot } from './config.js';

let _db = null;

/**
 * Initialize and return the database connection.
 * Creates data directory and applies schema + migrations on first call.
 */
export function getDb() {
  if (_db) return _db;

  // Ensure data directory exists
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  // Apply base schema
  const schemaPath = join(centreRoot, 'lib', 'schema.sql');
  if (existsSync(schemaPath)) {
    const schema = readFileSync(schemaPath, 'utf-8');
    _db.exec(schema);
  }

  // Run migrations
  runMigrations(_db);

  return _db;
}

/**
 * Apply any pending migrations from centre/migrations/*.sql
 */
function runMigrations(db) {
  const migrationsDir = join(centreRoot, 'migrations');
  if (!existsSync(migrationsDir)) return;

  // Get current schema version
  let currentVersion = 0;
  try {
    const row = db.prepare('SELECT MAX(version) as v FROM schema_version').get();
    currentVersion = row?.v ?? 0;
  } catch {
    currentVersion = 0;
  }

  // Read migration files
  const files = readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    // Extract version number from filename (e.g., 001_initial.sql -> 1)
    const match = file.match(/^(\d+)/);
    if (!match) continue;

    const version = parseInt(match[1], 10);
    if (version <= currentVersion) continue;

    const sql = readFileSync(join(migrationsDir, file), 'utf-8');
    // Strip leading comment-only lines before checking if there's real SQL
    const stripped = sql.replace(/^\s*--[^\n]*\n/gm, '').trim();
    if (stripped) {
      db.exec(sql);
    }

    db.prepare('INSERT OR REPLACE INTO schema_version (version) VALUES (?)').run(version);
  }
}

/**
 * Close the database connection.
 */
export function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}
