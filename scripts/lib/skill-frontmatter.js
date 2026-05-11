/**
 * skill-frontmatter.js
 *
 * Single canonical parser for SKILL.md YAML frontmatter.
 *
 * Used by:
 *   - scripts/rebuild-index.js (generates skills/_index.json)
 *   - centre/api/skills.js (dashboard fallback when _index.json missing)
 *   - scripts/smoke-parallel.js (structural validation)
 *
 * Earlier each of these had its own copy. Subtle divergences (smoke-parallel
 * couldn't read multi-line array values; skills.js handled escapes
 * differently) caused drift and silent feature loss — concurrency_pattern,
 * output_discipline, modes, and multi_angle_triggers were dropped from
 * _index.json without anyone noticing.
 *
 * This module is the source of truth. New consumers MUST import from
 * here instead of writing their own parser.
 *
 * Supports:
 *   - Scalar fields:       key: value      OR  key: "value"
 *   - Block-style arrays:  key:\n  - "item"
 *   - CRLF normalization
 *
 * Does NOT support (yet, by design):
 *   - Nested objects
 *   - Multi-line block scalars (`>`, `|`)
 *   - YAML anchors / references
 *
 * If a future field needs richer YAML, swap to a real YAML library (js-yaml)
 * here, in one place, and every consumer benefits.
 */

/**
 * Parse the frontmatter region (between leading `---\n...---`) from a SKILL.md.
 * Returns an object with scalar string values or string arrays.
 *
 * @param {string} content - full file contents
 * @returns {Record<string, string|string[]>}
 */
export function parseFrontmatter(content) {
  if (typeof content !== 'string') return {};
  const normalized = content.replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const fm = {};
  const lines = match[1].split('\n');
  let currentKey = null;

  for (const line of lines) {
    const kvMatch = line.match(/^(\w[\w_]*)\s*:\s*(.*)$/);
    const arrayItemMatch = line.match(/^\s+-\s+"?(.+?)"?\s*$/);

    if (kvMatch) {
      currentKey = kvMatch[1];
      const value = kvMatch[2].trim().replace(/^["']|["']$/g, '');
      if (value === '') {
        // Caller may follow up with array items; default to [] until we know.
        fm[currentKey] = [];
      } else {
        fm[currentKey] = value;
      }
    } else if (arrayItemMatch && currentKey) {
      if (!Array.isArray(fm[currentKey])) {
        fm[currentKey] = [];
      }
      fm[currentKey].push(arrayItemMatch[1]);
    }
  }

  return fm;
}

/**
 * Fields that we expose in the public skill record (used by the index,
 * dashboard, and smoke validation). Keep this list aligned with what
 * AGENTS.md treats as documented frontmatter.
 *
 * Adding a new field? Append it here AND to the SKILL.md spec section
 * in AGENTS.md, then regenerate the index. smoke-parallel.js will
 * validate that frontmatter values appear in _index.json.
 */
export const PUBLIC_SKILL_FIELDS = [
  'name',
  'version',
  'category',
  'description',
  'triggers',
  'negative_triggers',
  'multi_angle_triggers',
  'context_loads',
  'inputs',
  'outputs',
  'modes',
  'output_discipline',
  'concurrency_pattern',
  'secrets_required',
  'secrets_optional',
  'runtime_dependencies',
  'tier',
];

/**
 * Categorii valide pentru skill-uri robOS. Folosite de smoke-skills.js pentru
 * warn (NU fail) cand un skill declara o categorie necunoscuta — toleranta in
 * timpul portarii, dar visible in CI.
 *
 * Categoriile native (v1): brand, content, mode, research, sys, tool.
 * Categoriile adaugate la migrare (v2, port .claude/skills/):
 *   - 00:   orchestratori (multi-skill pipeline runners)
 *   - viz:  vizualizare (slides, diagrame, imagini, motion graphics)
 *   - vid:  video production (clip extraction, reframing, editing)
 *   - meta: skill-uri despre skill-uri (creator, system builder)
 */
export const VALID_CATEGORIES = [
  // v1 — robOS native
  'brand',
  'content',
  'mode',
  'research',
  'sys',
  'tool',
  // v2 — port .claude/skills/
  '00',
  'viz',
  'vid',
  'meta',
];

/**
 * Tier-uri valide pentru tiered onboarding install.
 *   - core:             instalat default, fara dependencies grele
 *   - content-creator:  cere Python + ffmpeg + pandoc + Playwright
 *   - video-producer:   cere Python + OpenCV DNN models + HandBrake + Node hyperframes
 *   - social-publisher: cere cont Zernio (ZERNIO_API_KEY)
 *   - researcher:       cere chei API (OPENAI, XAI, FIRECRAWL, APIFY)
 */
export const VALID_TIERS = [
  'core',
  'content-creator',
  'video-producer',
  'social-publisher',
  'researcher',
];

/**
 * Build a normalized skill record from raw frontmatter, applying defaults
 * and array-vs-scalar coercion.
 *
 * @param {Record<string, any>} fm - parsed frontmatter
 * @param {string} fallbackName - directory name to use if `name` is absent
 * @returns {Record<string, any>}
 */
export function normalizeSkillRecord(fm, fallbackName) {
  const isArrayField = (k) => [
    'triggers', 'negative_triggers', 'multi_angle_triggers',
    'context_loads', 'inputs', 'outputs', 'modes',
    'secrets_required', 'secrets_optional',
    'runtime_dependencies',
  ].includes(k);

  const record = {
    name: fm.name || fallbackName || '',
    version: fm.version || '0.0.0',
    category: fm.category || 'unknown',
    description: fm.description || '',
  };

  for (const k of PUBLIC_SKILL_FIELDS) {
    if (k in record) continue; // already set above
    if (isArrayField(k)) {
      record[k] = Array.isArray(fm[k]) ? fm[k] : [];
    } else if (fm[k] !== undefined && fm[k] !== '') {
      record[k] = fm[k];
    }
  }

  return record;
}
