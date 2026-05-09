#!/usr/bin/env node
// parallel-budget.js — concurrency policy + telemetry helper for robOS skills.
//
// Library: import { shouldParallelize, logTelemetry, MAX_PARALLEL_AGENTS } from './scripts/parallel-budget.js'
// CLI:
//   node scripts/parallel-budget.js check <units> <est_seconds_per_unit>
//   node scripts/parallel-budget.js log <skill> <mode> <agents> <failed> <wall_ms> <fallback> [client]
//   node scripts/parallel-budget.js stats [skill_name]
//
// F20 fix: was CommonJS while everything else in scripts/ is ESM. Converted
// to native ESM. CLI invocation still works (process.argv check at bottom).
// F12 fix: was using fs.appendFileSync (no rotation cap). Now routes through
// appendNdjson for consistent rotation behavior.

import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendNdjson } from './lib/ndjson-log.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROBOS_ROOT = join(__dirname, '..');

export const MIN_UNITS = 3;
export const MIN_SECONDS_PER_UNIT = 10;
export const MAX_PARALLEL_AGENTS = 8;

// ADVISORY values — NOT runtime-enforced. The Agent tool in Claude Code
// is invoked declaratively from SKILL.md prompts and the parent has no
// hook to race a Promise against the sub-agent's response. These values
// are kept as a documented policy that skills SHOULD respect when
// describing "if an agent hangs" behavior; they cannot be programmatically
// applied today. See AGENTS.md > Concurrency Patterns > Reguli globale.
export const SUBAGENT_TIMEOUT_MS_ADVISORY = 90_000;
export const SUBAGENT_HARD_CAP_MS_ADVISORY = 180_000;

const TELEMETRY_PATH = join(ROBOS_ROOT, 'data', 'skill-telemetry.ndjson');
const TELEMETRY_MAX_LINES = 2000; // archive log — bigger than activity (500)

export function shouldParallelize(units, estSecondsPerUnit) {
  if (typeof units !== 'number' || typeof estSecondsPerUnit !== 'number') return false;
  if (units < MIN_UNITS) return false;
  if (estSecondsPerUnit < MIN_SECONDS_PER_UNIT) return false;
  return true;
}

export function logTelemetry({ skill, mode, agents, agentsFailed, wallClockMs, fallbackUsed, client }) {
  // Read active client lazily — keep this independent from client-context.js
  // to avoid circular imports during testing.
  let clientSlug = client || null;
  if (!clientSlug) {
    try {
      const stateFile = join(ROBOS_ROOT, 'data', 'active-client.json');
      if (existsSync(stateFile)) {
        const data = JSON.parse(readFileSync(stateFile, 'utf-8'));
        if (data && typeof data.slug === 'string') clientSlug = data.slug;
      }
    } catch { /* keep null */ }
  }

  const entry = {
    ts: new Date().toISOString(),
    skill,
    mode,
    agents: Number(agents) || 0,
    agents_failed: Number(agentsFailed) || 0,
    wall_clock_ms: Number(wallClockMs) || 0,
    fallback_used: Boolean(fallbackUsed),
    client: clientSlug,
  };

  // F12 fix: route through appendNdjson — atomic, with rotation cap.
  appendNdjson(TELEMETRY_PATH, entry, { maxLines: TELEMETRY_MAX_LINES });
  return JSON.stringify(entry);
}

export function readStats(skillFilter) {
  if (!existsSync(TELEMETRY_PATH)) return { runs: 0, lines: [] };
  const lines = readFileSync(TELEMETRY_PATH, 'utf8')
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

// CLI invocation — only when run directly, not on import.
const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMainModule) {
  const cmd = process.argv[2];
  if (cmd === 'check') {
    const units = parseInt(process.argv[3], 10);
    const estSec = parseInt(process.argv[4], 10);
    console.log(shouldParallelize(units, estSec) ? 'parallel' : 'serial');
    process.exit(0);
  }
  if (cmd === 'log') {
    const [, , , skill, mode, agents, failed, ms, fallback, client] = process.argv;
    if (!skill || !mode) {
      console.error('Usage: log <skill> <mode> <agents> <failed> <wall_ms> <fallback> [client]');
      process.exit(1);
    }
    const line = logTelemetry({
      skill, mode,
      agents, agentsFailed: failed,
      wallClockMs: ms,
      fallbackUsed: fallback === 'true',
      client: client || null,
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
  console.log('  node scripts/parallel-budget.js check <units> <est_seconds_per_unit>');
  console.log('  node scripts/parallel-budget.js log <skill> <mode> <agents> <failed> <wall_ms> <fallback> [client]');
  console.log('  node scripts/parallel-budget.js stats [skill_name]');
  process.exit(1);
}
