#!/usr/bin/env node
/**
 * smoke-loop-detector.js
 *
 * End-to-end validation for loop-detector.js + hook-post-tool.js.
 *
 * Covers:
 *   - Single call → no warning
 *   - 2 same calls → no warning
 *   - 3 same calls → warning emitted ONCE
 *   - Reset on different call → counter resets, warning re-armable
 *   - Alternating A/B → never warns
 *   - 6 same → second warning at threshold*2
 *   - Exempt tool (TodoWrite) — never warns
 *   - Disabled via env → never warns
 *   - Hash determinism (key order independence)
 *   - Corrupt state file → graceful recovery
 *   - Hook handler stdin/stdout (live process integration)
 *
 * Each test runs in an isolated session_id so they cannot interfere.
 *
 * Exit 0 = all PASS; exit 1 = at least one FAIL.
 */

import { existsSync, writeFileSync, readFileSync, unlinkSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import {
  recordCall,
  resetSession,
  hashCall,
  canonicalJson,
  summarizeCall,
} from './lib/loop-detector.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROBOS_ROOT = join(__dirname, '..');
const STATE_DIR = join(ROBOS_ROOT, 'data', 'session-state');

let passed = 0;
let failed = 0;
const issuedSessions = new Set();

function check(label, cond, detail) {
  if (cond) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function eq(label, actual, expected) {
  check(label, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function freshSession(label) {
  const sid = `smoke-loop-${label}-${Date.now().toString(36)}`;
  issuedSessions.add(sid);
  return sid;
}

// ---------- Tests ----------

function testHashDeterminism() {
  console.log('\n--- hash determinism (key order) ---');
  const a = hashCall('Read', { file_path: 'x', limit: 10, offset: 5 });
  const b = hashCall('Read', { offset: 5, limit: 10, file_path: 'x' });
  eq('reordered keys produce same hash', a, b);
  const c = hashCall('Read', { file_path: 'x', limit: 11, offset: 5 });
  check('different value → different hash', a !== c);
  // Nested objects
  const d = hashCall('X', { meta: { a: 1, b: 2 } });
  const e = hashCall('X', { meta: { b: 2, a: 1 } });
  eq('nested object key reorder still stable', d, e);
}

function testCanonicalJson() {
  console.log('\n--- canonicalJson ---');
  eq('null', canonicalJson(null), 'null');
  eq('undefined → null', canonicalJson(undefined), 'null');
  eq('string', canonicalJson('hi'), '"hi"');
  eq('number', canonicalJson(42), '42');
  eq('array preserves order', canonicalJson([3, 1, 2]), '[3,1,2]');
  eq('object sorts keys', canonicalJson({ b: 1, a: 2 }), '{"a":2,"b":1}');
}

function testSummarize() {
  console.log('\n--- summarizeCall ---');
  eq('Read summary', summarizeCall('Read', { file_path: '/abs/foo.md' }), 'Read:foo.md');
  eq('Bash summary', summarizeCall('Bash', { command: 'ls -la' }), 'Bash:ls -la');
  eq('Grep summary', summarizeCall('Grep', { pattern: 'foo.*bar' }), 'Grep:foo.*bar');
  eq('Unknown tool', summarizeCall('UnknownTool', {}), 'UnknownTool');
}

function testSingleCall() {
  console.log('\n--- single call → no warning ---');
  const sid = freshSession('single');
  const r = recordCall(sid, 'Read', { file_path: 'x.md' });
  eq('  consecutive_count', r.consecutive_count, 1);
  eq('  no warning', r.warning, null);
}

function testTwoSameCalls() {
  console.log('\n--- two same calls → no warning ---');
  const sid = freshSession('two');
  recordCall(sid, 'Read', { file_path: 'x.md' });
  const r = recordCall(sid, 'Read', { file_path: 'x.md' });
  eq('  consecutive_count', r.consecutive_count, 2);
  eq('  no warning', r.warning, null);
}

function testThreeSameCalls() {
  console.log('\n--- three same calls → warning ---');
  const sid = freshSession('three');
  recordCall(sid, 'Read', { file_path: 'x.md' });
  recordCall(sid, 'Read', { file_path: 'x.md' });
  const r3 = recordCall(sid, 'Read', { file_path: 'x.md' });
  eq('  consecutive_count', r3.consecutive_count, 3);
  check('  warning emitted', !!r3.warning, `warning was ${r3.warning}`);
  check('  warning mentions hash', r3.warning?.includes(r3.hash));
  check('  warning mentions summary', r3.warning?.includes('Read:x.md'));

  // 4th identical call → no second warning yet (warnings_issued=1, threshold=3, 4 < 6)
  const r4 = recordCall(sid, 'Read', { file_path: 'x.md' });
  eq('  4th call still no second warning', r4.warning, null);
}

function testResetOnDifferentCall() {
  console.log('\n--- reset on different call ---');
  const sid = freshSession('reset');
  recordCall(sid, 'Read', { file_path: 'x.md' });
  recordCall(sid, 'Read', { file_path: 'x.md' });
  recordCall(sid, 'Read', { file_path: 'x.md' }); // warning fires here
  const interrupt = recordCall(sid, 'Read', { file_path: 'OTHER.md' });
  eq('  consecutive_count reset to 1', interrupt.consecutive_count, 1);
  eq('  no warning on reset', interrupt.warning, null);

  // Now 3 same again — should re-arm warning
  recordCall(sid, 'Bash', { command: 'echo hi' });
  recordCall(sid, 'Bash', { command: 'echo hi' });
  const re = recordCall(sid, 'Bash', { command: 'echo hi' });
  check('  warning re-fires after reset', !!re.warning);
}

function testAlternating() {
  console.log('\n--- alternating A/B never warns ---');
  const sid = freshSession('alt');
  for (let i = 0; i < 6; i++) {
    const r = recordCall(sid, i % 2 === 0 ? 'Read' : 'Bash', { x: i % 2 });
    check(`  iter ${i + 1} no warning`, r.warning === null);
  }
}

function testEscalation() {
  console.log('\n--- second warning at threshold*2 ---');
  const sid = freshSession('escalate');
  for (let i = 1; i <= 6; i++) {
    const r = recordCall(sid, 'Read', { file_path: 'loop.md' });
    if (i === 3) {
      check(`  call 3: tier-1 warning`, !!r.warning && r.warning.includes('[LOOP DETECTOR]') && !r.warning.includes('al doilea'));
    } else if (i === 6) {
      check(`  call 6: tier-2 warning`, !!r.warning && r.warning.includes('al doilea avertisment'));
    } else {
      check(`  call ${i}: no warning`, r.warning === null);
    }
  }
}

function testExempt() {
  console.log('\n--- exempt tool (TodoWrite default) ---');
  const sid = freshSession('exempt');
  for (let i = 0; i < 5; i++) {
    const r = recordCall(sid, 'TodoWrite', { todos: [] });
    check(`  iter ${i + 1} TodoWrite never warns`, r.warning === null);
    check(`  iter ${i + 1} marked exempt`, r.exempt === true);
  }
}

function testDisabled() {
  console.log('\n--- disabled via env ---');
  const sid = freshSession('disabled');
  for (let i = 0; i < 5; i++) {
    const r = recordCall(sid, 'Read', { file_path: 'x.md' }, {
      env: { ROBOS_LOOP_DETECTOR_DISABLED: '1' },
    });
    check(`  iter ${i + 1} disabled returns no warning`, r.warning === null && r.disabled === true);
  }
  // Verify NO state file was written when disabled
  const stateFile = join(STATE_DIR, `${sid}-tools.json`);
  check('  no state file written when disabled', !existsSync(stateFile));
}

function testCustomThreshold() {
  console.log('\n--- custom threshold via env ---');
  const sid = freshSession('thresh');
  for (let i = 1; i <= 5; i++) {
    const r = recordCall(sid, 'Read', { file_path: 'x.md' }, {
      env: { ROBOS_LOOP_DETECTOR_THRESHOLD: '5' },
    });
    if (i < 5) check(`  iter ${i} no warning yet`, r.warning === null);
    if (i === 5) check(`  iter 5: warning at custom threshold`, !!r.warning);
  }
}

function testCustomExempt() {
  console.log('\n--- custom exempt list via env ---');
  const sid = freshSession('exempt-custom');
  // Empty exempt list — TodoWrite no longer exempt
  for (let i = 0; i < 3; i++) {
    const r = recordCall(sid, 'TodoWrite', { todos: [] }, {
      env: { ROBOS_LOOP_DETECTOR_EXEMPT: '' },
    });
    if (i === 2) check('  TodoWrite warns when not in custom-empty exempt list', !!r.warning);
  }
}

function testCorruptState() {
  console.log('\n--- corrupt state file → graceful recovery ---');
  const sid = freshSession('corrupt');
  const stateFile = join(STATE_DIR, `${sid}-tools.json`);
  // Plant garbage
  writeFileSync(stateFile, 'this is not JSON {{{');
  let r;
  try {
    r = recordCall(sid, 'Read', { file_path: 'x.md' });
    check('  no crash on corrupt state', true);
    eq('  treats as fresh: count=1', r.consecutive_count, 1);
    eq('  no warning on first call after corruption', r.warning, null);
  } catch (e) {
    check('  no crash on corrupt state', false, e.message);
  }
}

function testInvalidSession() {
  console.log('\n--- invalid session_id → skipped silently ---');
  const r = recordCall('../../etc/passwd', 'Read', { file_path: 'x' });
  eq('  no warning', r.warning, null);
  eq('  marked skipped', r.skipped, 'invalid_session');
}

function testHookProcess() {
  console.log('\n--- live hook process via stdin ---');
  const sid = freshSession('hook');
  const hookPath = join(ROBOS_ROOT, 'scripts', 'hook-post-tool.js');
  const cmd = `node "${hookPath}"`;

  // Call 1 + 2: no output expected
  for (let i = 1; i <= 2; i++) {
    const out = execSync(cmd, {
      input: JSON.stringify({ session_id: sid, tool_name: 'Read', tool_input: { file_path: 'h.md' } }),
      encoding: 'utf-8',
    });
    eq(`  call ${i} stdout empty`, out, '');
  }

  // Call 3: expect JSON with warning
  const out3 = execSync(cmd, {
    input: JSON.stringify({ session_id: sid, tool_name: 'Read', tool_input: { file_path: 'h.md' } }),
    encoding: 'utf-8',
  });
  let parsed;
  try { parsed = JSON.parse(out3); } catch { parsed = null; }
  check('  call 3 stdout is valid JSON', !!parsed);
  check('  call 3 has hookSpecificOutput.additionalContext', !!parsed?.hookSpecificOutput?.additionalContext);
  check('  call 3 warning text contains [LOOP DETECTOR]',
    parsed?.hookSpecificOutput?.additionalContext?.includes('[LOOP DETECTOR]'));
}

// ---------- Cleanup ----------

function cleanup() {
  console.log('\n--- cleanup ---');
  let removed = 0;
  for (const sid of issuedSessions) {
    const path = join(STATE_DIR, `${sid}-tools.json`);
    if (existsSync(path)) {
      try { unlinkSync(path); removed++; } catch { /* ignore */ }
    }
  }
  // Also clean any *-tools.json from prior smoke runs (older debris).
  if (existsSync(STATE_DIR)) {
    try {
      for (const f of readdirSync(STATE_DIR)) {
        if (f.startsWith('smoke-loop-') && f.endsWith('-tools.json')) {
          try { unlinkSync(join(STATE_DIR, f)); removed++; } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  }
  console.log(`  removed ${removed} state files`);
}

// ---------- Run ----------

try {
  testCanonicalJson();
  testHashDeterminism();
  testSummarize();
  testSingleCall();
  testTwoSameCalls();
  testThreeSameCalls();
  testResetOnDifferentCall();
  testAlternating();
  testEscalation();
  testExempt();
  testDisabled();
  testCustomThreshold();
  testCustomExempt();
  testCorruptState();
  testInvalidSession();
  testHookProcess();
} catch (e) {
  failed++;
  console.error(`\nUNEXPECTED ERROR: ${e.stack || e.message}`);
} finally {
  cleanup();
}

console.log('\n=========================');
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${failed}`);
console.log('=========================');
process.exit(failed > 0 ? 1 : 0);
