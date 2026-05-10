#!/usr/bin/env node
/**
 * smoke-redact-coverage.js — Pin PRV-4 (no secrets in logs / activity stream).
 *
 * `scripts/lib/redact.js` is the single source of truth for credential
 * redaction. It already ships with a `--self-test` mode covering 16 known
 * provider patterns (Anthropic, OpenAI, Stripe, Firecrawl, Google, GitHub,
 * Cloudflare, Slack, npm, AWS, JWT, Bearer, env-style assignments).
 *
 * This smoke:
 *   1. Runs the embedded self-test → exit 0 = all 16 cases pass.
 *   2. Asserts every CALLER (activity-capture, redact-jsonl, redact-activity-log)
 *      imports redactSensitive — drift means a logger could miss redaction.
 *   3. Adds extension fixtures: chained patterns + a real-world Bearer in JSON.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { redactSensitive } from './lib/redact.js';

const __filename = fileURLToPath(import.meta.url);
const ROBOS_ROOT = join(dirname(__filename), '..');

let pass = 0;
let fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`); }
}

// --- Test 1: redact.js --self-test ---
console.log('--- redact.js --self-test ---');
{
  const r = spawnSync(process.execPath, [join(ROBOS_ROOT, 'scripts', 'lib', 'redact.js'), '--self-test'], {
    encoding: 'utf-8', shell: false, cwd: ROBOS_ROOT,
  });
  check('redact --self-test exits 0', r.status === 0, `exit ${r.status}`);
  check('redact --self-test reports all cases passed',
    /All \d+ cases passed\b/.test(r.stdout), 'expected "All N cases passed"');
}

// --- Test 2: callers import redactSensitive ---
console.log('\n--- Caller wiring ---');
{
  const callers = [
    'scripts/activity-capture.js',
    'scripts/redact-jsonl.js',
    'scripts/redact-activity-log.js',
  ];
  for (const rel of callers) {
    const path = join(ROBOS_ROOT, rel);
    if (!existsSync(path)) {
      check(`${rel} exists`, false);
      continue;
    }
    const src = readFileSync(path, 'utf-8');
    check(`${rel} imports redactSensitive`,
      /import\s*\{[^}]*\bredactSensitive\b[^}]*\}\s*from\s*['"][^'"]*redact[^'"]*['"]/.test(src),
      'logger could leak secrets without this');
    check(`${rel} actually calls redactSensitive`,
      /\bredactSensitive\s*\(/.test(src),
      'imported but never called = dead code');
  }
}

// --- Test 3: extension fixtures (real-world chains) ---
console.log('\n--- Extension fixtures ---');
{
  // Chained patterns in a single string
  const chain = 'auth: Bearer ' + 'A'.repeat(40) + ' + key=sk-' + 'B'.repeat(30);
  const out = redactSensitive(chain);
  check('Bearer + sk- chain both redacted',
    /Bearer \*\*\*\*/.test(out) && /sk-\*\*\*\*/.test(out),
    `got: ${out}`);

  // JSON-shaped Bearer (typical http header dump)
  const jsonHdr = '{"authorization": "Bearer ' + 'X'.repeat(60) + '"}';
  const outJson = redactSensitive(jsonHdr);
  check('Bearer in JSON header redacted',
    /Bearer \*\*\*\*/.test(outJson) && !/X{60}/.test(outJson),
    `got: ${outJson}`);

  // env-style chain
  const envLine = 'OPENAI_API_KEY=sk-' + 'Y'.repeat(30) + ' DATABASE_PASSWORD=hunter22long';
  const outEnv = redactSensitive(envLine);
  check('env-style assignments both redacted',
    /OPENAI_API_KEY=sk-\*\*\*\*/.test(outEnv) && /DATABASE_PASSWORD=\*\*\*\*/.test(outEnv),
    `got: ${outEnv}`);

  // Innocuous text untouched
  const innocent = 'fetched 23 records from /api/v1/users';
  check('innocent text unchanged', redactSensitive(innocent) === innocent);
}

console.log('\n=========================');
console.log(`PASSED: ${pass}`);
console.log(`FAILED: ${fail}`);
console.log('=========================');
process.exit(fail > 0 ? 1 : 0);
