#!/usr/bin/env node
/**
 * smoke-lint-security-rules.js — Pin SEC-7 (lint-security rules actually fire).
 *
 * lint-security.js currently reports 0 BLOCK / 0 WARN across the codebase.
 * That can mean either (a) no real violations exist (good) or (b) the rules
 * have a regex bug and never match (silent dead-rule). This smoke proves the
 * rules fire correctly on synthetic fixtures.
 *
 * Each rule is exercised with positive cases (must flag) AND negative cases
 * (must NOT flag) so we catch both false negatives and false positives.
 *
 * Imports `lintContent` from lint-security.js — black-box test of the
 * end-to-end flow, not internal regex inspection.
 */

import { lintContent } from './lint-security.js';

let pass = 0;
let fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`); }
}

function findingsByRule(content, rule) {
  return lintContent(content).filter(f => f.rule === rule);
}

// --- Rule 1: secret-strict-equals ---
console.log('--- Rule: secret-strict-equals ---');

const POSITIVE_SECRET = [
  ['if (token !== expected) {', 'plain token !== variable'],
  ['if (token === expected) return;', 'plain token === variable'],
  ['return password === userInput;', 'password compared to var'],
  ['if (apiKey !== providedKey) throw new Error("nope");', 'apiKey compared to var'],
  ['const ok = jwt === storedJwt;', 'jwt comparison'],
  ['if (signature === hmacResult) accept();', 'signature compared to result var'],
  ['const same = hmacValue !== providedHmac;', 'hmac compared to var'],
];
for (const [code, label] of POSITIVE_SECRET) {
  const found = findingsByRule(code, 'secret-strict-equals');
  check(`flags: "${label}"`, found.length === 1, `expected 1, got ${found.length}`);
}

const NEGATIVE_SECRET = [
  ['if (typeof token === "string") {', 'typeof check'],
  ['if (token === null) {', '=== null'],
  ['if (token !== undefined) {', '!== undefined'],
  ['if (token === "") return;', '=== empty string'],
  ['if (token.length === 64) {', '.length === N'],
  ['const x = 1 === 2;', 'no secret keyword'],
  ['if (token === expected) {} // lint-allow:secret-compare', 'allow comment'],
  ['// if (token === expected) {}', 'comment line'],
  ['if (token === false) {}', '=== false'],
];
for (const [code, label] of NEGATIVE_SECRET) {
  const found = findingsByRule(code, 'secret-strict-equals');
  check(`exempts: "${label}"`, found.length === 0, `expected 0, got ${found.length}: ${JSON.stringify(found.map(f => f.source))}`);
}

// --- Rule 2: hardcoded-secret-hex ---
console.log('\n--- Rule: hardcoded-secret-hex ---');

const POSITIVE_HEX = [
  // 32+ hex chars in quoted string
  ['const k = "abc123def456abc123def456abc123def456";', '36 hex chars'],
  ['const secret = "0123456789abcdef0123456789abcdef0123456789abcdef";', '48 hex chars'],
  ["const t = 'fedcba9876543210fedcba9876543210';", '32 hex chars (single quotes)'],
];
for (const [code, label] of POSITIVE_HEX) {
  const found = findingsByRule(code, 'hardcoded-secret-hex');
  check(`flags: ${label}`, found.length === 1, `expected 1, got ${found.length}`);
}

const NEGATIVE_HEX = [
  ['const PUBLIC_KEY = "abc123def456abc123def456abc123def456";', 'PUBLIC_KEY exempt'],
  ['const TEST_TOKEN = "abc123def456abc123def456abc123def456";', 'TEST_ exempt'],
  ['const FIXTURE_DATA = "abc123def456abc123def456abc123def456";', 'FIXTURE_ exempt'],
  ['const u = "550e8400-e29b-41d4-a716-446655440000";', 'UUID v4 exempt (dashes)'],
  ['const short = "abc123";', 'short hex (< 32) — not flagged'],
  ['const k = "abc123def456abc123def456abc123def456"; // lint-allow:hardcoded-secret', 'allow comment'],
  ['// const k = "abc123def456abc123def456abc123def456";', 'comment line'],
];
for (const [code, label] of NEGATIVE_HEX) {
  const found = findingsByRule(code, 'hardcoded-secret-hex');
  check(`exempts: ${label}`, found.length === 0, `expected 0, got ${found.length}: ${JSON.stringify(found.map(f => f.source))}`);
}

// --- Cross-rule sanity: combined input ---
console.log('\n--- Combined fixture ---');
{
  const code = `
function bad(token) {
  if (token === expected) return;             // BLOCK
  const k = "abc123def456abc123def456abc123def456";  // WARN
}
function good(token) {
  if (typeof token === "string") return;      // OK
  if (token === null) return;                 // OK
}
  `;
  const findings = lintContent(code);
  const blocks = findings.filter(f => f.severity === 'BLOCK');
  const warns = findings.filter(f => f.severity === 'WARN');
  check('combined: 1 BLOCK', blocks.length === 1, `got ${blocks.length}`);
  check('combined: 1 WARN', warns.length === 1, `got ${warns.length}`);
}

console.log('\n=========================');
console.log(`PASSED: ${pass}`);
console.log(`FAILED: ${fail}`);
console.log('=========================');
process.exit(fail > 0 ? 1 : 0);
