#!/usr/bin/env node
// smoke-parallel.js — structural smoke test for parallelized skills.
//
// Validates that every skill marked with concurrency_pattern in its frontmatter
// has the expected structural pieces:
//   - Output Discipline section (if encapsulated)
//   - Reference to scripts/parallel-budget.js (telemetry)
//   - Critical "INTR-UN SINGUR mesaj" instruction (parallel spawn discipline)
//   - Pattern documented in AGENTS.md
//
// This does NOT invoke skills (would cost tokens) — only validates SKILL.md
// shape so structural drift is caught before runtime.
//
// Exit 0 = all pass. Exit 1 = at least one failure.
//
// Usage:
//   node scripts/smoke-parallel.js          (full check)
//   node scripts/smoke-parallel.js verbose  (full check with per-rule output)

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { parseFrontmatter } from './lib/skill-frontmatter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VERBOSE = process.argv[2] === 'verbose';
const ROOT = path.join(__dirname, '..');
const SKILLS_DIR = path.join(ROOT, 'skills');
const AGENTS_MD = path.join(ROOT, 'AGENTS.md');

const KNOWN_PATTERNS = [
  'pillar-fan-out',
  'mapreduce-research',
  'multi-asset-generation',
  'multi-angle-creativity',
  'adversarial-synthesis',
];

function readSkill(name) {
  const skillFile = path.join(SKILLS_DIR, name, 'SKILL.md');
  if (!fs.existsSync(skillFile)) return null;
  return fs.readFileSync(skillFile, 'utf8');
}

// Use the canonical parser so smoke validation matches the index/dashboard
// view of the same SKILL.md content. Earlier this file had its own simpler
// parser that diverged silently.
const extractFrontmatter = parseFrontmatter;

function findParallelizedSkills() {
  const dirs = fs.readdirSync(SKILLS_DIR).filter((d) => {
    const stat = fs.statSync(path.join(SKILLS_DIR, d));
    return stat.isDirectory() && !d.startsWith('_');
  });
  const out = [];
  for (const d of dirs) {
    const c = readSkill(d);
    if (!c) continue;
    const fm = extractFrontmatter(c);
    if (fm.concurrency_pattern) {
      const patternRaw = fm.concurrency_pattern.split('(')[0].trim();
      out.push({ name: d, content: c, frontmatter: fm, pattern: patternRaw });
    }
  }
  return out;
}

function checkSkill(skill) {
  const failures = [];
  const c = skill.content;

  if (!KNOWN_PATTERNS.includes(skill.pattern)) {
    failures.push(`unknown concurrency_pattern "${skill.pattern}" — expected one of ${KNOWN_PATTERNS.join(', ')}`);
  }

  if (!/parallel-budget\.js/.test(c)) {
    failures.push('no reference to scripts/parallel-budget.js (telemetry contract violated)');
  }

  if (!/INTR-UN SINGUR mesaj|in a single message/i.test(c)) {
    failures.push('missing the "INTR-UN SINGUR mesaj" parallel spawn discipline instruction');
  }

  if (skill.frontmatter.output_discipline === 'encapsulated' && !/Output Discipline/i.test(c)) {
    failures.push('frontmatter says encapsulated but no "Output Discipline" section in body');
  }

  if (!/subagent_type:\s*general-purpose/.test(c)) {
    failures.push('no Agent invocation block found (expected subagent_type: general-purpose)');
  }

  return failures;
}

function checkAgentsMd(skills) {
  const failures = [];
  if (!fs.existsSync(AGENTS_MD)) {
    failures.push('AGENTS.md not found');
    return failures;
  }
  const c = fs.readFileSync(AGENTS_MD, 'utf8');
  if (!/Concurrency Patterns/.test(c)) {
    failures.push('AGENTS.md missing "Concurrency Patterns" section');
  }
  for (const p of KNOWN_PATTERNS) {
    const inUse = skills.some((s) => s.pattern === p);
    if (!inUse) continue;
    const needle = p.replace(/-/g, '[- ]?');
    const re = new RegExp(needle, 'i');
    if (!re.test(c)) {
      failures.push(`AGENTS.md does not document pattern "${p}" but skills use it`);
    }
  }
  return failures;
}

function main() {
  const skills = findParallelizedSkills();
  if (skills.length === 0) {
    console.error('No parallelized skills found (no concurrency_pattern frontmatter).');
    process.exit(1);
  }

  let totalFails = 0;
  console.log(`Smoke test: ${skills.length} parallelized skills found.\n`);

  for (const s of skills) {
    const fails = checkSkill(s);
    if (fails.length === 0) {
      if (VERBOSE) console.log(`  [OK]   ${s.name} (${s.pattern})`);
    } else {
      console.log(`  [FAIL] ${s.name} (${s.pattern})`);
      for (const f of fails) console.log(`         - ${f}`);
      totalFails += fails.length;
    }
  }

  if (!VERBOSE && totalFails === 0) {
    console.log(`  [OK]   all ${skills.length} skills pass structural checks`);
  }

  console.log('\nAGENTS.md cross-check:');
  const agentsFails = checkAgentsMd(skills);
  if (agentsFails.length === 0) {
    console.log('  [OK]   patterns documented and in sync');
  } else {
    for (const f of agentsFails) console.log(`  [FAIL] ${f}`);
    totalFails += agentsFails.length;
  }

  console.log('');
  if (totalFails === 0) {
    console.log('All checks passed.');
    process.exit(0);
  } else {
    console.log(`${totalFails} failure(s). See output above.`);
    process.exit(1);
  }
}

main();
