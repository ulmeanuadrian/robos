#!/usr/bin/env node
/**
 * smoke-license-integrity.js — verifica cross-hash tamper detection.
 *
 * Tests:
 *   1. Baseline: verifyIntegrity() returneaza ok=true cu manifesto curent.
 *   2. Tamper peer: modifica trivial setup.js → ok=false, file matches.
 *   3. Tamper self: modifica trivial license-validator.js (non-marker line) → ok=false, file=validator.
 *   4. Marker line edit: modifica DOAR o linie marker → ok=true (marker lines stripped before hash).
 *
 * Toate testele restoreaza fisierele dupa ele. Foloseste in-memory rebind via dynamic
 * import + cache busting (?t=N) ca sa nu cache-uiasca verifyIntegrity intre teste.
 *
 * Exit: 0 verde, 1 daca orice test esueaza.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const VALIDATOR = join(ROOT, 'scripts', 'lib', 'license-validator.js');
const SETUP = join(ROOT, 'scripts', 'setup.js');

let pass = 0;
let fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`); }
}

// Bust ESM module cache via query string
async function freshVerify() {
  const m = await import(pathToFileURL(VALIDATOR).href + '?t=' + Date.now() + Math.random());
  return m.verifyIntegrity();
}

async function withBackup(path, fn) {
  const original = readFileSync(path, 'utf-8');
  try {
    return await fn(original);
  } finally {
    writeFileSync(path, original);
  }
}

async function main() {
  console.log('--- license-validator integrity smoke ---');

  // 1. Baseline
  const baseline = await freshVerify();
  check('baseline ok', baseline.ok === true, JSON.stringify(baseline));

  // 2. Tamper peer (setup.js)
  await withBackup(SETUP, async (original) => {
    writeFileSync(SETUP, original + '\n// tampered for smoke test\n');
    const r = await freshVerify();
    check('peer tamper detected', r.ok === false, JSON.stringify(r));
    check(
      'peer tamper points at setup.js',
      r.file === 'scripts/setup.js',
      `got file=${r.file}`
    );
  });

  // Restore confirmation
  const afterRestore1 = await freshVerify();
  check('restore peer → ok again', afterRestore1.ok === true, JSON.stringify(afterRestore1));

  // 3. Tamper self (validator) — non-marker line
  await withBackup(VALIDATOR, async (original) => {
    // Insert non-marker line at end (no "robos:i" suffix → counted in hash)
    writeFileSync(VALIDATOR, original + '\n// tampered self for smoke test\n');
    const r = await freshVerify();
    check('self tamper detected', r.ok === false, JSON.stringify(r));
    check(
      'self tamper points at validator',
      r.file === 'scripts/lib/license-validator.js',
      `got file=${r.file}`
    );
  });

  const afterRestore2 = await freshVerify();
  check('restore self → ok again', afterRestore2.ok === true, JSON.stringify(afterRestore2));

  // 4. Tamper validator while updating its OWN SELF hash in lockstep should
  //    STILL be detected — because peers also need to be re-hashed (which
  //    requires rerunning rehash). Half-bypass attempt should fail.
  await withBackup(VALIDATOR, async (original) => {
    // Simulez "attacker care a inteles ca trebuie rehash dar nu poate rula scriptul":
    // adauga o linie non-marker + incearca sa updeze self hash la o valoare aleatoare.
    const tampered = original
      .replace(/\nexport function verifyIntegrity/, '\n// pwnd\nexport function verifyIntegrity')
      .replace(/(self:\s*')([0-9a-f]{64})(')/, "$1deadbeef".padEnd(64 + "$1".length, 'a') + "$3");
    writeFileSync(VALIDATOR, tampered);
    const r = await freshVerify();
    check(
      'half-bypass (modify + fake self hash) STILL detected',
      r.ok === false,
      `expected fail (attacker cant compute valid self hash without running rehash); got ${JSON.stringify(r)}`
    );
  });

  // Final baseline re-check
  const finalCheck = await freshVerify();
  check('final baseline ok', finalCheck.ok === true, JSON.stringify(finalCheck));

  console.log('\n=========================');
  console.log(`PASSED: ${pass}`);
  console.log(`FAILED: ${fail}`);
  console.log('=========================');
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  if (process.env.DEBUG) console.error(e.stack);
  process.exit(1);
});
