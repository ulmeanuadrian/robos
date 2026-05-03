import { getDb, closeDb } from '../lib/db.js';
import { dataDir, dbPath } from '../lib/config.js';

console.log('Initializing RobOS Centre database...');
console.log(`  Data dir: ${dataDir}`);
console.log(`  DB path:  ${dbPath}`);

try {
  const db = getDb();
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
  console.log(`  Tables:   ${tables.map(t => t.name).join(', ')}`);
  console.log('Database initialized successfully.');
  closeDb();
} catch (err) {
  console.error('Failed to initialize database:', err.message);
  process.exit(1);
}
