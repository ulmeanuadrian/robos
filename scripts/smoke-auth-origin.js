#!/usr/bin/env node
// scripts/smoke-auth-origin.js — F7 fix verification.
//
// Bug: centre/lib/auth.js isSameOrigin() returned true when Origin header
// was missing. Any local process (npm dep, vscode ext, Node fetch without
// Origin) could call /api/auth/token and steal the dashboard token without
// browser-CSRF protection.
//
// Fix: missing Origin → false. Browser fetches always send Origin; CLI
// tooling that needs API access must use Bearer auth directly (not bootstrap
// via /api/auth/token).

import { isSameOrigin, getAuthToken, checkBearer } from '../centre/lib/auth.js';

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log(`  PASS  ${msg}`); }
  else { fail++; console.log(`  FAIL  ${msg}`); }
}

const PORT = 3001;
const TOKEN = 'a'.repeat(64);

console.log('--- isSameOrigin (F7 fix) ---');

// Helper: build a mock req with given headers
const req = (headers) => ({ headers });

assert(isSameOrigin(req({ origin: `http://127.0.0.1:${PORT}` }), PORT) === true,
  'allow Origin=http://127.0.0.1:PORT');

assert(isSameOrigin(req({ origin: `http://localhost:${PORT}` }), PORT) === true,
  'allow Origin=http://localhost:PORT');

assert(isSameOrigin(req({ origin: 'https://evil.com' }), PORT) === false,
  'reject Origin=https://evil.com');

assert(isSameOrigin(req({ origin: 'http://127.0.0.1:9999' }), PORT) === false,
  'reject wrong-port Origin');

assert(isSameOrigin(req({}), PORT) === false,
  'F7: reject missing Origin header (was the bypass)');

assert(isSameOrigin(req({ origin: '' }), PORT) === false,
  'reject empty Origin string');

console.log('\n--- getAuthToken (gating) ---');

// Stash + set token for this test
const origToken = process.env.ROBOS_DASHBOARD_TOKEN;
process.env.ROBOS_DASHBOARD_TOKEN = TOKEN;

try {
  const ok = getAuthToken(req({ origin: `http://127.0.0.1:${PORT}` }), PORT);
  assert(ok.token === TOKEN, 'returns token for valid same-origin request');
} catch (e) {
  fail++; console.log(`  FAIL  expected token, got error: ${e.message}`);
}

try {
  getAuthToken(req({}), PORT);
  fail++; console.log('  FAIL  expected throw on missing Origin (F7), got success');
} catch (e) {
  assert(e.statusCode === 403, `F7: throws 403 on missing Origin (got ${e.statusCode})`);
}

try {
  getAuthToken(req({ origin: 'https://evil.com' }), PORT);
  fail++; console.log('  FAIL  expected throw on cross-origin');
} catch (e) {
  assert(e.statusCode === 403, `throws 403 on cross-origin (got ${e.statusCode})`);
}

console.log('\n--- checkBearer (independent of Origin) ---');

// Valid Bearer should work regardless of Origin (CLI use-case)
assert(checkBearer(req({ authorization: `Bearer ${TOKEN}` })) === null,
  'valid Bearer with no Origin → success (CLI use-case preserved)');

assert(checkBearer(req({ authorization: 'Bearer wrong-token' })).status === 401,
  'invalid Bearer → 401');

assert(checkBearer(req({})).status === 401,
  'no Authorization header → 401');

// Restore
if (origToken === undefined) delete process.env.ROBOS_DASHBOARD_TOKEN;
else process.env.ROBOS_DASHBOARD_TOKEN = origToken;

console.log('\n=========================');
console.log(`PASSED: ${pass}`);
console.log(`FAILED: ${fail}`);
console.log('=========================');

process.exit(fail > 0 ? 1 : 0);
