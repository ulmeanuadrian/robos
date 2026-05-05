import { getDb, closeDb } from '../lib/db.js';
import { dataDir, dbPath } from '../lib/config.js';

console.log('Initializez baza de date robOS Centre...');
console.log(`  Director date: ${dataDir}`);
console.log(`  Path DB:       ${dbPath}`);

try {
  const db = getDb();
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
  console.log(`  Tabele:        ${tables.map(t => t.name).join(', ')}`);
  console.log('Baza de date initializata cu succes.');
  closeDb();
} catch (err) {
  console.error('Initializare DB esuata:', err.message);
  process.exit(1);
}
