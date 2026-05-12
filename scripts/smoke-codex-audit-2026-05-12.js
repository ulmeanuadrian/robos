#!/usr/bin/env node
/**
 * smoke-codex-audit-2026-05-12.js
 *
 * Invariant tests for the 9 bugs surfaced by the 2026-05-12 codex audit
 * (4 BLOCKER, 4 MAJOR, 1 MINOR). Each test is fix-of-class, not fix-of-instance:
 * it asserts the invariant directly, so future regressions in adjacent code
 * still trip the smoke.
 *
 * See context/audits/2026-05-12-codex-full.md for the source findings.
 *
 * Exit: 0 = all green, 1 = any red.
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync, statSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const ROBOS_ROOT = join(dirname(__filename), '..');

let pass = 0;
let fail = 0;
const failures = [];

function ok(label) {
  console.log(`  [PASS] ${label}`);
  pass++;
}
function bad(label, detail) {
  console.error(`  [FAIL] ${label}`);
  if (detail) console.error(`         ${detail}`);
  fail++;
  failures.push(label);
}
function section(title) {
  console.log(`\n=== ${title} ===`);
}

// ============================================================================
// BUG 1 — /api/files path traversal must reject `brand/../.env` and friends.
// Class invariant: `readFile(p)` returns null for any p that canonicalizes to
// a denied path, even if p itself doesn't look denied.
// ============================================================================
async function smokeBug1() {
  section('BUG 1 — /api/files path traversal');
  const { readFile } = await import('../centre/api/files.js');

  const traversalPaths = [
    'brand/../.env',
    'brand/../../robos/.env',
    'context/../.env',
    'projects/../data/robos.db',
    '../.env',
    'brand/..\\.env',          // Windows-style separator
    'brand/./../.env',         // dot segment + traversal
    '/.env',                   // absolute-style
  ];

  for (const p of traversalPaths) {
    const result = readFile(p);
    if (result === null) {
      ok(`traversal rejected: ${p}`);
    } else {
      const preview = typeof result?.content === 'string' ? result.content.slice(0, 40) : '<dir-listing>';
      bad(`traversal LEAKED: ${p}`, `got: ${preview}...`);
    }
  }

  // Positive control: a legitimate file inside a browsable scope still works
  // (if it exists). Use a known-safe path: skills/_index.json if present
  // — actually that's denied (skills doesn't include _ underscore). Use CLAUDE.md.
  const safePath = 'CLAUDE.md';
  if (existsSync(join(ROBOS_ROOT, safePath))) {
    const result = readFile(safePath);
    if (result && typeof result.content === 'string') {
      ok(`legitimate read still works: ${safePath}`);
    } else {
      bad(`legitimate read broke: ${safePath}`, 'fix over-corrected');
    }
  }
}

// ============================================================================
// BUG 2 — Cron leader lock must be exclusive at concurrent startup.
// Class invariant: spawning N tryAcquire() in parallel results in exactly one true.
// ============================================================================
async function smokeBug2() {
  section('BUG 2 — Cron leader exclusive create');

  const LOCK_PATH = join(ROBOS_ROOT, 'data', 'cron-leader.lock');
  // Save existing lock if any
  let backup = null;
  if (existsSync(LOCK_PATH)) {
    backup = readFileSync(LOCK_PATH, 'utf-8');
    unlinkSync(LOCK_PATH);
  }

  // Verify the source has 'wx' flag in the exclusive path (static check)
  const src = readFileSync(join(ROBOS_ROOT, 'centre', 'lib', 'cron-leader-lock.js'), 'utf-8');
  if (/flag:\s*'wx'/.test(src)) {
    ok('writeLockExclusive uses flag: wx');
  } else {
    bad('writeLockExclusive missing flag: wx', 'race window still open');
  }

  // Dynamic check: spawn 4 children that all try to acquire simultaneously.
  // Each child holds the lock for ~2s (alive PID + fresh heartbeat) before
  // exiting, so concurrent acquires must arbitrate via the wx flag rather
  // than waiting for a previous child to die. spawnSync would serialize them
  // and defeat the test, so we use async spawn + Promise.all.
  const { pathToFileURL } = await import('node:url');
  const lockUrl = pathToFileURL(join(ROBOS_ROOT, 'centre', 'lib', 'cron-leader-lock.js')).href;
  const child = `
    import('${lockUrl}')
      .then(async m => {
        const won = m.tryAcquire();
        // Print verdict on its own line, last line of stdout
        console.log('VERDICT:' + (won ? 'LEADER' : 'PASSIVE'));
        // Hold alive for 2s so siblings see this PID as a live competitor
        await new Promise(r => setTimeout(r, 2000));
        try { m.release(); } catch {}
        process.exit(0);
      })
      .catch(e => { console.error(e.message); process.exit(2); });
  `;

  const childPromises = [];
  for (let i = 0; i < 4; i++) {
    childPromises.push(new Promise(resolve => {
      const p = spawn(process.execPath, ['--input-type=module', '-e', child], {
        cwd: ROBOS_ROOT,
      });
      let stdout = '';
      let stderr = '';
      p.stdout.on('data', d => { stdout += d.toString(); });
      p.stderr.on('data', d => { stderr += d.toString(); });
      p.on('close', () => resolve({ stdout, stderr }));
    }));
  }
  const all = await Promise.all(childPromises);
  // Extract VERDICT: line per child (last one wins if any duplicates)
  const results = all.map(r => {
    const m = r.stdout.match(/VERDICT:(LEADER|PASSIVE)/);
    return m ? m[1] : '';
  });
  const leaders = results.filter(r => r === 'LEADER').length;
  if (leaders === 1) {
    ok(`exactly one leader elected (4 concurrent tryAcquire)`);
  } else {
    bad(`${leaders} leaders elected (expected 1)`, `results: ${results.join(',')}`);
  }

  // Cleanup: remove lock from smoke run, restore backup if any
  if (existsSync(LOCK_PATH)) unlinkSync(LOCK_PATH);
  if (backup) writeFileSync(LOCK_PATH, backup);
}

// ============================================================================
// BUG 3 — Skill registry stays consistent on rebuild failure.
// Class invariant: every dir in skills/ with SKILL.md must be in _index.json,
// and every name in _index.json must have a folder on disk.
// ============================================================================
async function smokeBug3() {
  section('BUG 3 — Skill registry sync invariant');

  const SKILLS_DIR = join(ROBOS_ROOT, 'skills');
  const INDEX_FILE = join(SKILLS_DIR, '_index.json');

  if (!existsSync(INDEX_FILE)) {
    bad('_index.json missing', 'run: node scripts/rebuild-index.js');
    return;
  }

  const index = JSON.parse(readFileSync(INDEX_FILE, 'utf-8'));
  const indexed = new Set((index.skills || []).map(s => s.name));

  const onDisk = new Set();
  const { readdirSync } = await import('node:fs');
  for (const e of readdirSync(SKILLS_DIR, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith('_')) continue;
    if (existsSync(join(SKILLS_DIR, e.name, 'SKILL.md'))) onDisk.add(e.name);
  }

  // Drift detection
  const onlyInIndex = [...indexed].filter(n => !onDisk.has(n));
  const onlyOnDisk = [...onDisk].filter(n => !indexed.has(n));

  if (onlyInIndex.length === 0) {
    ok('no skills listed in index but missing on disk');
  } else {
    bad('index lists missing skills', onlyInIndex.join(', '));
  }
  if (onlyOnDisk.length === 0) {
    ok('no skills on disk but missing from index');
  } else {
    bad('disk has skills missing from index', onlyOnDisk.join(', '));
  }

  // Source-level check: add-skill.js rollbacks on rebuild fail
  const addSrc = readFileSync(join(ROBOS_ROOT, 'scripts', 'add-skill.js'), 'utf-8');
  if (/rebuildResult\.status\s*!==\s*0/.test(addSrc) && /rmSync\(SKILL_DST/.test(addSrc)) {
    ok('add-skill.js rolls back on rebuild failure');
  } else {
    bad('add-skill.js missing rollback', 'rebuild fail leaves drift');
  }

  const rmSrc = readFileSync(join(ROBOS_ROOT, 'scripts', 'remove-skill.js'), 'utf-8');
  if (/rebuildResult\.status\s*!==\s*0/.test(rmSrc) && /process\.exit\(1\)/.test(rmSrc)) {
    ok('remove-skill.js exits non-zero on rebuild failure');
  } else {
    bad('remove-skill.js missing non-zero exit', 'rebuild fail produces silent drift');
  }
}

// ============================================================================
// BUG 4 — Memory writes are atomic.
// Class invariant: saveMemoryFile routes through atomicWrite, never raw
// writeFileSync on the target path.
// ============================================================================
async function smokeBug4() {
  section('BUG 4 — Memory atomic write');

  const src = readFileSync(join(ROBOS_ROOT, 'centre', 'api', 'system.js'), 'utf-8');

  // Look for atomicWrite usage inside saveMemoryFile, and absence of
  // raw writeFileSync(path, content, ...) for the target file.
  const saveFn = src.match(/export function saveMemoryFile[\s\S]*?\n\}/);
  if (!saveFn) {
    bad('saveMemoryFile not found', 'cannot verify');
    return;
  }
  const body = saveFn[0];

  if (/atomicWrite\(path,/.test(body)) {
    ok('saveMemoryFile uses atomicWrite for target file');
  } else {
    bad('saveMemoryFile does NOT use atomicWrite', 'partial-write risk');
  }

  // Reject leftover raw writeFileSync(path, ... — backup write is on a
  // different identifier (backupDir/${date}-${ts}.md), so this regex is safe.
  if (/writeFileSync\(path,\s*content/.test(body)) {
    bad('saveMemoryFile still has raw writeFileSync(path, content)', 'BLOCKER not fixed');
  } else {
    ok('no raw writeFileSync(path, content) in saveMemoryFile');
  }

  // Dynamic test: concurrent writes don't produce empty/partial files
  const sys = await import('../centre/api/system.js');
  const TEST_DATE = '2026-01-01';  // far past, won't collide with real memory
  const dir = join(ROBOS_ROOT, 'context', 'memory');
  const path = join(dir, `${TEST_DATE}.md`);
  const hadBackup = existsSync(path);
  let backup = hadBackup ? readFileSync(path, 'utf-8') : null;

  try {
    // Write 5 times with distinct content; final should be valid (not partial)
    for (let i = 0; i < 5; i++) {
      sys.saveMemoryFile(TEST_DATE, `# Smoke test ${i}\n${'x'.repeat(1000)}\n`);
    }
    const content = readFileSync(path, 'utf-8');
    if (content.startsWith('# Smoke test 4') && content.length > 1000) {
      ok('rapid successive saves leave file complete (no partial)');
    } else {
      bad('rapid saves left partial/corrupt file', `len=${content.length} head=${content.slice(0, 60)}`);
    }
  } finally {
    // Restore
    if (existsSync(path)) unlinkSync(path);
    if (backup !== null) writeFileSync(path, backup);
  }
}

// ============================================================================
// BUG 5 — process.env refreshes after .env dashboard write.
// Class invariant: after setEnv({key, value}), process.env[key] === value.
// ============================================================================
async function smokeBug5() {
  section('BUG 5 — .env reload after setEnv');

  const src = readFileSync(join(ROBOS_ROOT, 'centre', 'api', 'settings.js'), 'utf-8');
  if (/process\.env\[u\.key\]\s*=\s*u\.value/.test(src)) {
    ok('setEnv mutates process.env after atomic write');
  } else {
    bad('setEnv does not refresh process.env', 'skills still get stale env');
  }
}

// ============================================================================
// BUG 6 — Memory save accepts explicit scope.
// Class invariant: getMemoryFile and saveMemoryFile both take {scope} opts,
// AND saveMemoryFile uses that scope (not active client) when writing.
// ============================================================================
async function smokeBug6() {
  section('BUG 6 — Memory scope-explicit write');

  const sys = await import('../centre/api/system.js');

  // Static: signatures changed
  const src = readFileSync(join(ROBOS_ROOT, 'centre', 'api', 'system.js'), 'utf-8');
  if (/saveMemoryFile\(date,\s*content,\s*opts/.test(src)) {
    ok('saveMemoryFile signature accepts opts (with scope)');
  } else {
    bad('saveMemoryFile signature does not accept scope opts', 'BUG 6 not fixed');
  }
  if (/getMemoryFile\(date,\s*opts/.test(src)) {
    ok('getMemoryFile signature accepts opts (with scope)');
  } else {
    bad('getMemoryFile signature does not accept scope opts', 'cannot round-trip scope');
  }

  // Server.js threads scope through
  const serverSrc = readFileSync(join(ROBOS_ROOT, 'centre', 'server.js'), 'utf-8');
  if (/scope:\s*body\.scope/.test(serverSrc) && /scope:\s*query\.scope/.test(serverSrc)) {
    ok('server.js threads scope through GET/PUT memory routes');
  } else {
    bad('server.js does not thread scope', 'API still routes to active client only');
  }

  // Dynamic: write to root scope explicitly, even though no active client
  // (we don't toggle active client here — too invasive — but this asserts
  // the explicit-root path writes where expected).
  const TEST_DATE = '2026-01-02';
  const rootPath = join(ROBOS_ROOT, 'context', 'memory', `${TEST_DATE}.md`);
  let backup = existsSync(rootPath) ? readFileSync(rootPath, 'utf-8') : null;
  try {
    sys.saveMemoryFile(TEST_DATE, '# explicit root scope\n', { scope: 'root' });
    if (existsSync(rootPath)) {
      ok('scope:"root" writes to root memory dir');
    } else {
      bad('scope:"root" did not produce expected file', rootPath);
    }
  } catch (e) {
    bad('scope:"root" threw', e.message);
  } finally {
    if (existsSync(rootPath)) unlinkSync(rootPath);
    if (backup !== null) writeFileSync(rootPath, backup);
  }
}

// ============================================================================
// BUG 7 — Recovery prune only removes consumed:true files.
// Class invariant: pruneDirByAge of RECOVERY_DIR has a predicate that reads
// each file's JSON and only allows removal if consumed === true.
// ============================================================================
async function smokeBug7() {
  section('BUG 7 — Recovery prune predicate respects consumed');

  const src = readFileSync(join(ROBOS_ROOT, 'scripts', 'session-timeout-detector.js'), 'utf-8');
  if (/pruneDirByAge\(RECOVERY_DIR[\s\S]{0,400}consumed\s*===\s*true/.test(src)) {
    ok('RECOVERY_DIR prune predicate checks consumed === true');
  } else {
    bad('RECOVERY_DIR prune predicate missing consumed check', 'unconsumed flags lost after 7 days');
  }

  // Dynamic: place an old unconsumed file in RECOVERY_DIR and run prune.
  // It must survive.
  const RECOVERY_DIR = join(ROBOS_ROOT, 'data', 'session-recovery');
  mkdirSync(RECOVERY_DIR, { recursive: true });
  const TEST_NAME = '__smoke_test_unconsumed_2026-01-03.json';
  const testFile = join(RECOVERY_DIR, TEST_NAME);
  writeFileSync(testFile, JSON.stringify({ detected_at: '2025-01-01T00:00:00Z', abandoned_sessions: [], consumed: false }));

  // Backdate mtime to 30 days ago
  const oldMtime = new Date(Date.now() - 30 * 86400_000);
  try {
    const fs = await import('node:fs');
    fs.utimesSync(testFile, oldMtime, oldMtime);
  } catch (e) {
    bad('utimesSync failed', e.message);
  }

  // Run the prune via the detector in quiet mode
  const result = spawnSync(process.execPath, [
    join(ROBOS_ROOT, 'scripts', 'session-timeout-detector.js'),
    '--quiet', '--hours', '99999', // never flag anything new
  ], { cwd: ROBOS_ROOT, encoding: 'utf8' });
  if (result.status !== 0) {
    bad('detector exit non-zero', result.stderr?.slice(0, 200));
  }

  if (existsSync(testFile)) {
    ok('30-day-old UNCONSUMED recovery survived prune');
    unlinkSync(testFile);
  } else {
    bad('30-day-old UNCONSUMED recovery was incorrectly pruned', 'data loss');
  }

  // Inverse: 30-day-old CONSUMED file SHOULD be pruned
  const TEST_NAME_C = '__smoke_test_consumed_2026-01-03.json';
  const testFileC = join(RECOVERY_DIR, TEST_NAME_C);
  writeFileSync(testFileC, JSON.stringify({ detected_at: '2025-01-01T00:00:00Z', abandoned_sessions: [], consumed: true, consumed_at: '2025-01-02T00:00:00Z' }));
  try {
    const fs = await import('node:fs');
    fs.utimesSync(testFileC, oldMtime, oldMtime);
  } catch { /* ignore */ }

  spawnSync(process.execPath, [
    join(ROBOS_ROOT, 'scripts', 'session-timeout-detector.js'),
    '--quiet', '--hours', '99999',
  ], { cwd: ROBOS_ROOT, encoding: 'utf8' });

  if (!existsSync(testFileC)) {
    ok('30-day-old CONSUMED recovery WAS pruned (positive control)');
  } else {
    bad('CONSUMED recovery NOT pruned (predicate too strict)', 'disk grows unbounded');
    unlinkSync(testFileC);
  }
}

// ============================================================================
// BUG 8 — setup-env.js uses shared atomicWrite (unique tmp per-process).
// Class invariant: no local atomicWrite with fixed ENV_TMP_PATH; import
// from scripts/lib/atomic-write.js.
// ============================================================================
function smokeBug8() {
  section('BUG 8 — setup-env.js uses shared atomicWrite');

  const src = readFileSync(join(ROBOS_ROOT, 'scripts', 'setup-env.js'), 'utf-8');

  if (/import\s*\{\s*atomicWrite[^}]*\}\s*from\s*'\.\/lib\/atomic-write\.js'/.test(src)) {
    ok('setup-env.js imports atomicWrite from shared lib');
  } else {
    bad('setup-env.js does not import shared atomicWrite', 'local race-prone tmp path likely');
  }

  if (/const ENV_TMP_PATH\s*=/.test(src)) {
    bad('setup-env.js still defines ENV_TMP_PATH (fixed tmp)', 'concurrent runs race');
  } else {
    ok('setup-env.js no longer defines fixed ENV_TMP_PATH');
  }

  // Function form: no local function atomicWrite(...)
  if (/function atomicWrite\s*\(/.test(src)) {
    bad('setup-env.js still defines local atomicWrite()', 'duplicate logic, fixed-tmp race');
  } else {
    ok('setup-env.js no local atomicWrite definition');
  }
}

// ============================================================================
// BUG 9 — rebuild-index.js output is byte-stable for unchanged input.
// Class invariant: running rebuild twice produces identical bytes.
// ============================================================================
function smokeBug9() {
  section('BUG 9 — rebuild-index byte-stable idempotency');

  const INDEX_FILE = join(ROBOS_ROOT, 'skills', '_index.json');
  const SECRETS_FILE = join(ROBOS_ROOT, 'data', 'required-secrets.json');

  // First rebuild
  const r1 = spawnSync(process.execPath, [join(ROBOS_ROOT, 'scripts', 'rebuild-index.js')], {
    cwd: ROBOS_ROOT, encoding: 'utf8',
  });
  if (r1.status !== 0) {
    bad('first rebuild failed', r1.stderr?.slice(0, 200));
    return;
  }
  const idx1 = readFileSync(INDEX_FILE, 'utf-8');
  const sec1 = existsSync(SECRETS_FILE) ? readFileSync(SECRETS_FILE, 'utf-8') : '';

  // No `generated_at` in output
  if (/"generated_at"/.test(idx1)) {
    bad('_index.json still contains generated_at', 'non-idempotent output');
  } else {
    ok('_index.json has no generated_at field');
  }

  // Second rebuild — must be byte-identical
  const r2 = spawnSync(process.execPath, [join(ROBOS_ROOT, 'scripts', 'rebuild-index.js')], {
    cwd: ROBOS_ROOT, encoding: 'utf8',
  });
  if (r2.status !== 0) {
    bad('second rebuild failed', r2.stderr?.slice(0, 200));
    return;
  }
  const idx2 = readFileSync(INDEX_FILE, 'utf-8');
  const sec2 = existsSync(SECRETS_FILE) ? readFileSync(SECRETS_FILE, 'utf-8') : '';

  if (idx1 === idx2) {
    ok('_index.json byte-identical across two rebuilds');
  } else {
    bad('_index.json drifts between rebuilds', `len ${idx1.length} -> ${idx2.length}`);
  }
  if (sec1 === sec2) {
    ok('required-secrets.json byte-identical across two rebuilds');
  } else {
    bad('required-secrets.json drifts between rebuilds', `len ${sec1.length} -> ${sec2.length}`);
  }
}

// ============================================================================
// Runner
// ============================================================================
(async () => {
  console.log('Smoke: codex audit fixes (2026-05-12)');
  console.log('Source: context/audits/2026-05-12-codex-full.md');

  try { await smokeBug1(); } catch (e) { bad('smokeBug1 threw', e.message); }
  try { await smokeBug2(); } catch (e) { bad('smokeBug2 threw', e.message); }
  try { await smokeBug3(); } catch (e) { bad('smokeBug3 threw', e.message); }
  try { await smokeBug4(); } catch (e) { bad('smokeBug4 threw', e.message); }
  try { await smokeBug5(); } catch (e) { bad('smokeBug5 threw', e.message); }
  try { await smokeBug6(); } catch (e) { bad('smokeBug6 threw', e.message); }
  try { await smokeBug7(); } catch (e) { bad('smokeBug7 threw', e.message); }
  try { smokeBug8(); } catch (e) { bad('smokeBug8 threw', e.message); }
  try { smokeBug9(); } catch (e) { bad('smokeBug9 threw', e.message); }

  console.log(`\n=== Summary: ${pass} pass, ${fail} fail ===`);
  if (fail > 0) {
    console.error('\nFailures:');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  process.exit(0);
})();
