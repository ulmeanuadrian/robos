#!/usr/bin/env node
/**
 * learnings-aggregator.js
 *
 * Scaneaza context/learnings.md, gaseste pattern-uri recurente per skill, produce
 * un raport saptamanal in context/learnings/_review-YYYY-WW.md cu top reguli care
 * merita codificate (ridicate la nivel de instructiune permanenta in SKILL.md sau CLAUDE.md).
 *
 * Heuristici (deterministe — fara LLM):
 *  - Per skill section, numara entries datate (### YYYY-MM-DD ...)
 *  - Numara mentions "Action:" sau "Actiune:" (semn de feedback aplicabil)
 *  - Numara "Resolved", "Confirmed" (semn de regula deja stabilizata)
 *  - Detecteaza n-grams (3-4 cuvinte) repetate >= 3 ori in feedback bullets
 *  - Daca un skill are >= 3 actions in ultimele 30 zile FARA promote la SKILL.md → flag
 *
 * Output:
 *  - context/learnings/_review-YYYY-WW.md (creat sau actualizat)
 *  - data/learnings-aggregate.log (NDJSON, append per rulare)
 *
 * Folosire:
 *  node scripts/learnings-aggregator.js                # produce raport pentru saptamana curenta
 *  node scripts/learnings-aggregator.js --quiet
 *  node scripts/learnings-aggregator.js --window 60    # priveste ultimele 60 de zile (default 30)
 *
 * Apelat de:
 *  - cron/defaults/learnings-review.json (saptamanal)
 *  - manual
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { appendNdjson } from './lib/ndjson-log.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROBOS_ROOT = join(__dirname, '..');
const LEARNINGS_FILE = join(ROBOS_ROOT, 'context', 'learnings.md');
const REVIEW_DIR = join(ROBOS_ROOT, 'context', 'learnings');
const DATA_DIR = join(ROBOS_ROOT, 'data');
const LOG_FILE = join(DATA_DIR, 'learnings-aggregate.log');

const STOPWORDS = new Set([
  'de', 'la', 'in', 'cu', 'pe', 'pentru', 'din', 'sa', 'sau', 'si', 'nu',
  'o', 'a', 'al', 'ca', 'da', 'el', 'ea', 'fi', 'fie', 'va', 'vor', 'au',
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be',
  'to', 'of', 'in', 'on', 'at', 'for', 'with', 'as', 'by', 'this', 'that',
  'it', 'its', 'from', 'so', 'if', 'not', 'no', 'do', 'has', 'have', 'had',
]);

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { window: 30, quiet: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--window' && args[i + 1]) {
      opts.window = parseInt(args[i + 1], 10) || 30;
      i++;
    } else if (args[i] === '--quiet' || args[i] === '-q') {
      opts.quiet = true;
    }
  }
  return opts;
}

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function isoWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return { year: d.getUTCFullYear(), week: weekNum };
}

function daysAgoISO(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Splits learnings.md into per-skill sections.
 * Returns { skillName: { entries: [{date, body}], rawBody } }
 */
function parseLearnings(content) {
  const sections = {};
  // Split by ## headers (skill names)
  const skillMatches = [...content.matchAll(/^##\s+([^\n]+)\n([\s\S]*?)(?=^##\s+|$(?![\s\S]))/gm)];

  for (const match of skillMatches) {
    const skillName = match[1].trim();
    const body = match[2];

    // Within skill, find dated entries (### YYYY-MM-DD ...)
    const entryMatches = [...body.matchAll(/^###\s+(\d{4}-\d{2}-\d{2})([^\n]*)\n([\s\S]*?)(?=^###\s+|^##\s+|$(?![\s\S]))/gm)];
    const entries = entryMatches.map(em => ({
      date: em[1],
      title: em[2].trim().replace(/^\s*[—–-]\s*/, ''),
      body: em[3].trim(),
    }));

    sections[skillName] = { entries, rawBody: body };
  }

  return sections;
}

/**
 * Detecteaza pattern-uri intr-un body de feedback.
 */
function analyzeBody(body) {
  const findings = {
    actions: [],
    resolved: [],
    keywords: new Map(),
  };

  // Match "Action:" or "Actiune:" lines
  const actionRe = /^[\s-]*\*?\*?(?:Action|Actiune|Action item|Acțiune)\*?\*?\s*:\s*(.+)$/gim;
  for (const m of body.matchAll(actionRe)) {
    findings.actions.push(m[1].trim());
  }

  // Match Resolved/Confirmed
  const resolvedRe = /^[\s-]*\*?\*?(?:Resolved|Confirmed|Stabilit|Confirmat|Rezolvat)\*?\*?[:\s]/gim;
  for (const m of body.matchAll(resolvedRe)) {
    findings.resolved.push(m[0].trim());
  }

  // Extract significant words (3+ chars, not stopwords)
  const words = body
    .toLowerCase()
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !STOPWORDS.has(w));

  for (const w of words) {
    findings.keywords.set(w, (findings.keywords.get(w) || 0) + 1);
  }

  return findings;
}

async function main() {
  const opts = parseArgs();
  const today = new Date().toISOString().slice(0, 10);
  const cutoff = daysAgoISO(opts.window);
  const { year, week } = isoWeek();
  const weekTag = `${year}-W${String(week).padStart(2, '0')}`;

  if (!existsSync(LEARNINGS_FILE)) {
    if (!opts.quiet) console.log(`[learnings] ${LEARNINGS_FILE} nu exista — niciun raport generat.`);
    process.exit(0);
  }

  const content = readFileSync(LEARNINGS_FILE, 'utf-8');
  const sections = parseLearnings(content);

  // Pentru fiecare skill, calculeaza statistici in fereastra
  const report = [];
  for (const [skillName, data] of Object.entries(sections)) {
    const recentEntries = data.entries.filter(e => e.date >= cutoff);
    if (recentEntries.length === 0) continue;

    const actionCount = recentEntries.reduce((sum, e) => sum + analyzeBody(e.body).actions.length, 0);
    const resolvedCount = recentEntries.reduce((sum, e) => sum + analyzeBody(e.body).resolved.length, 0);

    // Rule candidate: skill cu >= 3 actions in fereastra fara la fel de multe resolved
    const isCandidate = actionCount >= 3 && resolvedCount < actionCount;

    report.push({
      skill: skillName,
      entries_in_window: recentEntries.length,
      actions: actionCount,
      resolved: resolvedCount,
      is_rule_candidate: isCandidate,
      latest_entry_date: recentEntries[recentEntries.length - 1]?.date || null,
      sample_actions: recentEntries.flatMap(e => analyzeBody(e.body).actions).slice(0, 3),
    });
  }

  // Sort: rule candidates first, then by action count
  report.sort((a, b) => {
    if (a.is_rule_candidate !== b.is_rule_candidate) return b.is_rule_candidate - a.is_rule_candidate;
    return b.actions - a.actions;
  });

  // Build markdown report
  const lines = [];
  lines.push(`# Learnings Review — ${weekTag}`);
  lines.push('');
  lines.push(`Generated: ${today} | Window: last ${opts.window} days | Skills with activity: ${report.length}`);
  lines.push('');

  const candidates = report.filter(r => r.is_rule_candidate);
  if (candidates.length > 0) {
    lines.push('## Rule candidates');
    lines.push('');
    lines.push('Skills cu >= 3 actions neresolved in fereastra. Recomanda promote la regula in SKILL.md sau CLAUDE.md.');
    lines.push('');
    for (const c of candidates) {
      lines.push(`### ${c.skill}`);
      lines.push(`- Entries in window: ${c.entries_in_window}`);
      lines.push(`- Actions: ${c.actions} (resolved: ${c.resolved})`);
      lines.push(`- Latest entry: ${c.latest_entry_date}`);
      if (c.sample_actions.length) {
        lines.push(`- Sample actions:`);
        for (const a of c.sample_actions) {
          lines.push(`  - ${a.slice(0, 200)}${a.length > 200 ? '...' : ''}`);
        }
      }
      lines.push('');
    }
  } else {
    lines.push('## Rule candidates');
    lines.push('');
    lines.push('Niciun skill nu a acumulat >= 3 actions neresolved in fereastra. Toate par sa fie metabolizate.');
    lines.push('');
  }

  lines.push('## All skills with activity');
  lines.push('');
  lines.push('| Skill | Entries | Actions | Resolved | Candidate? |');
  lines.push('|-------|---------|---------|----------|------------|');
  for (const r of report) {
    const flag = r.is_rule_candidate ? 'YES' : '';
    lines.push(`| ${r.skill} | ${r.entries_in_window} | ${r.actions} | ${r.resolved} | ${flag} |`);
  }
  lines.push('');

  lines.push('## Next step');
  lines.push('');
  if (candidates.length > 0) {
    lines.push('Pentru fiecare rule candidate de mai sus:');
    lines.push('1. Citeste sample actions');
    lines.push('2. Daca pattern-ul e clar (3+ feedbacks despre acelasi lucru), promote la regula in `skills/{skill}/SKILL.md` sau `CLAUDE.md`');
    lines.push('3. Marcheaza entries-urile aplicate ca **Resolved:** in `context/learnings.md`');
  } else {
    lines.push('Sistemul e in stare buna. Nimic critic de promovat saptamana asta.');
  }

  // Write report
  ensureDir(REVIEW_DIR);
  const reportPath = join(REVIEW_DIR, `_review-${weekTag}.md`);
  writeFileSync(reportPath, lines.join('\n'), 'utf-8');

  // Append to data log (NDJSON, with rotation)
  appendNdjson(LOG_FILE, {
    aggregated_at: new Date().toISOString(),
    week: weekTag,
    window_days: opts.window,
    skills_with_activity: report.length,
    rule_candidates: candidates.length,
    report_path: reportPath,
  });

  if (!opts.quiet) {
    console.log(`[learnings] Aggregated ${report.length} skills. Rule candidates: ${candidates.length}.`);
    if (candidates.length > 0) {
      for (const c of candidates) {
        console.log(`  - ${c.skill}: ${c.actions} actions, ${c.resolved} resolved`);
      }
    }
    console.log(`  Report: ${reportPath}`);
  }
}

main().catch(e => {
  console.error(`[learnings-aggregator] eroare: ${e.message}`);
  process.exit(2);
});
