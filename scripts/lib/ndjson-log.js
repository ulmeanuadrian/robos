/**
 * ndjson-log.js
 *
 * Helper partajat pentru NDJSON logs cu rotation.
 * Cap fiecare log la N linii — peste limita, pastreaza ultimele N (drop oldest).
 *
 * Folosit de: audit-startup.js, session-timeout-detector.js, learnings-aggregator.js.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const DEFAULT_MAX_LINES = 1000;

/**
 * Append o intrare la un NDJSON log file. Daca fisierul depaseste maxLines,
 * trunchiaza la ultimele maxLines (drop oldest).
 *
 * @param {string} path - cale absoluta la log
 * @param {object} entry - obiect care va fi serializat ca o linie
 * @param {object} opts
 * @param {number} opts.maxLines - default 1000
 */
export function appendNdjson(path, entry, { maxLines = DEFAULT_MAX_LINES } = {}) {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const newLine = JSON.stringify(entry) + '\n';

  if (!existsSync(path)) {
    writeFileSync(path, newLine, 'utf-8');
    return;
  }

  // Citim, append, verificam dimensiune
  const existing = readFileSync(path, 'utf-8');
  const lines = existing.split('\n').filter(l => l.trim());
  lines.push(JSON.stringify(entry));

  if (lines.length > maxLines) {
    // Drop cele mai vechi
    const trimmed = lines.slice(-maxLines);
    writeFileSync(path, trimmed.join('\n') + '\n', 'utf-8');
  } else {
    // Re-scriem normal (mai sigur decat append cu chunk-uri)
    writeFileSync(path, lines.join('\n') + '\n', 'utf-8');
  }
}
