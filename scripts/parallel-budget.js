#!/usr/bin/env node
// parallel-budget.js — concurrency policy + telemetry helper for robOS skills.
//
// Usage:
//   Library:
//     const { shouldParallelize, logTelemetry, MAX_PARALLEL_AGENTS } = require('./scripts/parallel-budget');
//
//   CLI:
//     node scripts/parallel-budget.js check <units> <est_seconds_per_unit>
//     node scripts/parallel-budget.js log <skill> <mode> <agents> <failed> <wall_ms> <fallback_used>
//     node scripts/parallel-budget.js stats [skill_name]

const fs = require('fs');
const path = require('path');

const MIN_UNITS = 3;
const MIN_SECONDS_PER_UNIT = 10;
const MAX_PARALLEL_AGENTS = 8;

// ADVISORY values — NOT runtime-enforced. The Agent tool in Claude Code
// is invoked declaratively from SKILL.md prompts and the parent has no
// hook to race a Promise against the sub-agent's response. These values
// are kept as a documented policy that skills SHOULD respect when
// describing "if an agent hangs" behavior; they cannot be programmatically
// applied today. See AGENTS.md > Concurrency Patterns > Reguli globale.
const SUBAGENT_TIMEOUT_MS_ADVISORY = 90_000;
const SUBAGENT_HARD_CAP_MS_ADVISORY = 180_000;

function shouldParallelize(units, estSecondsPerUnit) {
  if (typeof units !== 'number' || typeof estSecondsPerUnit !== 'number') return false;
  if (units < MIN_UNITS) return false;
  if (estSecondsPerUnit < MIN_SECONDS_PER_UNIT) return false;
  return true;
}

function telemetryFile() {
  return path.join(__dirname, '..', 'data', 'skill-telemetry.ndjson');
}

function logTelemetry({ skill, mode, agents, agentsFailed, wallClockMs, fallbackUsed }) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    skill,
    mode,
    agents: Number(agents) || 0,
    agents_failed: Number(agentsFailed) || 0,
    wall_clock_ms: Number(wallClockMs) || 0,
    fallback_used: Boolean(fallbackUsed),
  });
  const file = telemetryFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, line + '\n');
  return line;
}

function readStats(skillFilter) {
  const file = telemetryFile();
  if (!fs.existsSync(file)) return { runs: 0, lines: [] };
  const lines = fs.readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    })
    .filter(Boolean);
  const filtered = skillFilter ? lines.filter((r) => r.skill === skillFilter) : lines;
  if (filtered.length === 0) return { runs: 0, lines: [] };
  const total = filtered.length;
  const failed = filtered.filter((r) => r.agents_failed > 0).length;
  const fallbacks = filtered.filter((r) => r.fallback_used).length;
  const avgWall = Math.round(filtered.reduce((s, r) => s + r.wall_clock_ms, 0) / total);
  return {
    runs: total,
    failure_rate_pct: Math.round((failed / total) * 100),
    fallback_rate_pct: Math.round((fallbacks / total) * 100),
    avg_wall_clock_ms: avgWall,
    last_run: filtered[filtered.length - 1].ts,
  };
}

module.exports = {
  shouldParallelize,
  logTelemetry,
  readStats,
  MIN_UNITS,
  MIN_SECONDS_PER_UNIT,
  MAX_PARALLEL_AGENTS,
  SUBAGENT_TIMEOUT_MS_ADVISORY,
  SUBAGENT_HARD_CAP_MS_ADVISORY,
};

if (require.main === module) {
  const cmd = process.argv[2];
  if (cmd === 'check') {
    const units = parseInt(process.argv[3], 10);
    const estSec = parseInt(process.argv[4], 10);
    console.log(shouldParallelize(units, estSec) ? 'parallel' : 'serial');
    process.exit(0);
  }
  if (cmd === 'log') {
    const [, , , skill, mode, agents, failed, ms, fallback] = process.argv;
    if (!skill || !mode) {
      console.error('Usage: log <skill> <mode> <agents> <failed> <wall_ms> <fallback>');
      process.exit(1);
    }
    const line = logTelemetry({
      skill, mode,
      agents, agentsFailed: failed,
      wallClockMs: ms,
      fallbackUsed: fallback === 'true',
    });
    console.log('logged:', line);
    process.exit(0);
  }
  if (cmd === 'stats') {
    const skill = process.argv[3];
    console.log(JSON.stringify(readStats(skill), null, 2));
    process.exit(0);
  }
  console.log('Usage:');
  console.log('  node parallel-budget.js check <units> <est_seconds_per_unit>');
  console.log('  node parallel-budget.js log <skill> <mode> <agents> <failed> <wall_ms> <fallback>');
  console.log('  node parallel-budget.js stats [skill_name]');
  process.exit(1);
}
