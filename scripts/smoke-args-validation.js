#!/usr/bin/env node
/**
 * smoke-args-validation.js — Pin SEC-5 (runSkill args reject NUL/CR/LF only).
 *
 * Backstory (CHANGELOG S3): the original ARGS regex blocked spaces, breaking
 * legitimate multi-word inputs. The current regex `/[\0\n\r]/` is the
 * MINIMAL safe ban list given `spawn(node, [...], { shell: false })` — shell
 * metacharacters are never interpreted; only NUL / newlines can corrupt argv
 * parsing or break NDJSON log entries.
 *
 * Imports `validateRunSkillArgs` from scripts/lib/args-validator.js (single
 * source of truth, also consumed by centre/api/system.js runSkill).
 *
 * Catches: a future "tightening" that re-bans spaces or punctuation, OR a
 * loosening that accepts NUL/CR/LF, OR a divergence between system.js and
 * the lib.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRunSkillArgs, ARGS_FORBIDDEN_RE, ARGS_MAX_LEN } from './lib/args-validator.js';

const __filename = fileURLToPath(import.meta.url);
const ROBOS_ROOT = join(dirname(__filename), '..');

let pass = 0;
let fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`); }
}

// --- Test 1: positive cases (must be accepted) ---
console.log('--- Positive cases (multi-word + special chars allowed) ---');

const POSITIVE = [
  ['hello world', 'spaces'],
  ['scrie un articol despre AI in romana', 'romanian + spaces'],
  ['build with --flag=value', 'CLI flag style'],
  ['user@example.com', 'email-like'],
  ['path/to/file.md', 'path with slashes'],
  [`'single' "double" \`tick\``, 'all quote types'],
  ['$, &, |, ;, <, >, *, ?', 'shell metas (safe with shell:false)'],
  ['accente: ăâîșț ĂÂÎȘȚ', 'romanian diacritics'],
  ['tab\there', 'tab character is OK'],
  ['', 'empty string'],
  ['a'.repeat(ARGS_MAX_LEN), `exactly ARGS_MAX_LEN (${ARGS_MAX_LEN})`],
];

for (const [input, label] of POSITIVE) {
  const r = validateRunSkillArgs(input);
  check(`accept: ${label}`, r.ok === true,
    r.ok ? '' : `unexpectedly rejected: ${r.error}`);
}

// --- Test 2: negative cases (must be rejected) ---
console.log('\n--- Negative cases (NUL/CR/LF + length cap) ---');

const NEGATIVE = [
  ['has\0null', 'null byte'],
  ['has\nnewline', 'newline'],
  ['has\rcarriage', 'carriage return'],
  ['has\r\nCRLF', 'CRLF sequence'],
  ['multi\nline\nbreak', 'multiple newlines'],
  ['a'.repeat(ARGS_MAX_LEN + 1), `over ARGS_MAX_LEN (${ARGS_MAX_LEN + 1})`],
  [42, 'non-string (number)'],
  [null, 'non-string (null)'],
  [undefined, 'non-string (undefined)'],
  [{ args: 'object' }, 'non-string (object)'],
];

for (const [input, label] of NEGATIVE) {
  const r = validateRunSkillArgs(input);
  check(`reject: ${label}`, r.ok === false,
    r.ok ? 'unexpectedly accepted' : '');
  if (r.ok === false) {
    check(`reject: ${label} returns error message`,
      typeof r.error === 'string' && r.error.length > 0);
  }
}

// --- Test 3: regex itself (sanity) ---
console.log('\n--- ARGS_FORBIDDEN_RE sanity ---');
check('ARGS_FORBIDDEN_RE matches \\0', ARGS_FORBIDDEN_RE.test('\0'));
check('ARGS_FORBIDDEN_RE matches \\n', ARGS_FORBIDDEN_RE.test('\n'));
check('ARGS_FORBIDDEN_RE matches \\r', ARGS_FORBIDDEN_RE.test('\r'));
check('ARGS_FORBIDDEN_RE does NOT match space', !ARGS_FORBIDDEN_RE.test(' '));
check('ARGS_FORBIDDEN_RE does NOT match tab', !ARGS_FORBIDDEN_RE.test('\t'));
check('ARGS_FORBIDDEN_RE does NOT match shell metas',
  !ARGS_FORBIDDEN_RE.test('$();|&<>*?'));

// --- Test 4: system.js still routes through the lib (no drift) ---
console.log('\n--- centre/api/system.js wiring ---');
{
  const sysSrc = readFileSync(join(ROBOS_ROOT, 'centre', 'api', 'system.js'), 'utf-8');
  check('system.js imports validateRunSkillArgs from lib',
    /from\s+['"][^'"]*args-validator(\.js)?['"]/.test(sysSrc));
  check('system.js does NOT redefine ARGS_FORBIDDEN_RE locally',
    !/^const ARGS_FORBIDDEN_RE\s*=/m.test(sysSrc),
    'a local redefinition would shadow the lib import');
  check('system.js calls validateRunSkillArgs on body.args',
    /validateRunSkillArgs\s*\(\s*args\s*\)/.test(sysSrc));
}

console.log('\n=========================');
console.log(`PASSED: ${pass}`);
console.log(`FAILED: ${fail}`);
console.log('=========================');
process.exit(fail > 0 ? 1 : 0);
