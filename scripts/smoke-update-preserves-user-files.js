#!/usr/bin/env node
/**
 * smoke-update-preserves-user-files.js — Pin UX-5 + DAT-5.
 *
 * Verifies the contract that `update.js` will NEVER overwrite user content:
 *
 *   1. PROTECTED_PATHS list contains every known user-data location.
 *   2. isProtected() correctly classifies known protected and non-protected paths.
 *   3. Simulated `applyExtracted`-equivalent walk on a TMP fixture: protected
 *      files are NOT touched, code files ARE updated.
 *
 * Imports from scripts/lib/protected-paths.js (single source of truth, also
 * consumed by update.js). If update.js drifts away from the lib, that's caught
 * by reading update.js source and asserting the import is present.
 *
 * Strategy avoids spawning update.js end-to-end (would require network +
 * license + tarball). The structural + isolated-function tests cover the
 * regression risks: someone removing a path from the array, or breaking
 * isProtected logic.
 */

import {
  existsSync, mkdirSync, rmSync, writeFileSync, readFileSync, copyFileSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { PROTECTED_PATHS, isProtected } from './lib/protected-paths.js';

const __filename = fileURLToPath(import.meta.url);
const ROBOS_ROOT = join(dirname(__filename), '..');

let pass = 0;
let fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`); }
}

// --- Test 1: PROTECTED_PATHS coverage ---
console.log('--- PROTECTED_PATHS coverage ---');

const REQUIRED_ENTRIES = [
  'brand/',
  'context/',
  'clients/',
  'projects/',
  'cron/jobs/',
  'data/',
  '.env',
];
for (const entry of REQUIRED_ENTRIES) {
  check(`PROTECTED_PATHS includes "${entry}"`, PROTECTED_PATHS.includes(entry));
}

// --- Test 2: isProtected classification ---
console.log('\n--- isProtected classification ---');

const PROTECTED_CASES = [
  '.env',
  '.env.bak',
  'brand/voice.md',
  'brand/audience.md',
  'context/USER.md',
  'context/memory/2026-05-10.md',
  'context/learnings.md',
  'context/audits/2026-05-09.md',
  'clients/acme-corp/brand/voice.md',
  'clients/acme-corp/projects/blog-post.md',
  'projects/content-blog-post/article.md',
  'cron/jobs/daily-audit.json',
  'data/robos.db',
  'data/active-client.json',
  'connections.md',
  // Backslash variant (Windows path)
  'brand\\voice.md',
];
for (const p of PROTECTED_CASES) {
  check(`isProtected("${p}") = true`, isProtected(p) === true);
}

const NON_PROTECTED_CASES = [
  'scripts/setup.js',
  'scripts/lib/env-loader.js',
  'centre/server.js',
  'centre/package.json',
  'skills/sys-onboard/SKILL.md',
  'README.md',
  'AGENTS.md',
  'CLAUDE.md',
  'VERSION',
  'CHANGELOG.md',
  'WHATS-NEW.md',
  'licensing/wrangler.toml',
  '.gitignore',
  // Tricky: file named exactly like a protected path's basename but in different dir
  'docs/data-format.md',
  // Empty / weird
  '',
];
for (const p of NON_PROTECTED_CASES) {
  check(`isProtected("${p}") = false`, isProtected(p) === false);
}

// --- Test 3: simulated update walk preserves user data ---
console.log('\n--- simulated update walk ---');

const TMP = join(tmpdir(), `robos-update-sim-${process.pid}-${Date.now()}`);
try {
  // "Existing install" with user data + code
  const installDir = join(TMP, 'install');
  mkdirSync(installDir, { recursive: true });

  const userFiles = {
    '.env': 'OPENAI_API_KEY=sk-USER-VALUE\nROBOS_DASHBOARD_TOKEN=user-token-32-hex\n',
    'brand/voice.md': '# user-customized voice\n',
    'context/USER.md': '# Adrian — operator profile\n',
    'context/memory/2026-05-10.md': '## Session 1\n### Goal\nUser-authored memory.\n',
    'projects/test-output.md': 'User project output.\n',
    'cron/jobs/test-job.json': '{"schedule":"@daily","command":"echo hi"}\n',
    'clients/zz-test/brand/voice.md': 'client voice\n',
    'data/active-client.json': '{"slug":"zz-test"}\n',
  };
  const codeFiles = {
    'VERSION': '2.0.0\n',
    'scripts/setup.js': '// old setup\n',
    'centre/server.js': '// old server\n',
    'README.md': '# robOS old\n',
  };

  for (const [rel, content] of Object.entries({ ...userFiles, ...codeFiles })) {
    const path = join(installDir, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }

  // "Update extracted" — has only code files (since tarball has no user data per DST-1)
  const extractedDir = join(TMP, 'extracted', 'robOS');
  mkdirSync(extractedDir, { recursive: true });
  const newCode = {
    'VERSION': '2.1.0\n',
    'scripts/setup.js': '// new setup\n',
    'centre/server.js': '// new server\n',
    'README.md': '# robOS new\n',
  };
  for (const [rel, content] of Object.entries(newCode)) {
    const path = join(extractedDir, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  // Hostile case: tarball ACCIDENTALLY contains a protected file (regression scenario).
  // applyExtracted should still skip it.
  mkdirSync(join(extractedDir, 'context'), { recursive: true });
  writeFileSync(join(extractedDir, 'context', 'USER.md'), '# attacker-overwrite content\n');
  mkdirSync(join(extractedDir, 'brand'), { recursive: true });
  writeFileSync(join(extractedDir, 'brand', 'voice.md'), '# attacker-overwrite voice\n');

  // Replicate applyExtracted algorithm from update.js using the SAME isProtected lib.
  function walk(dir, baseDir, cb) {
    const { readdirSync, statSync } = require('node:fs');
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      const st = statSync(path);
      const rel = path.slice(baseDir.length + 1).replace(/\\/g, '/');
      if (st.isDirectory()) {
        walk(path, baseDir, cb);
      } else {
        cb(rel, path);
      }
    }
  }

  // Actually use ESM-style synchronous fs (no require)
  const { readdirSync, statSync } = await import('node:fs');
  function walkEsm(dir, baseDir, cb) {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      const st = statSync(path);
      const rel = path.slice(baseDir.length + 1).replace(/\\/g, '/');
      if (st.isDirectory()) {
        walkEsm(path, baseDir, cb);
      } else {
        cb(rel, path);
      }
    }
  }

  walkEsm(extractedDir, extractedDir, (rel, srcPath) => {
    if (isProtected(rel)) return; // SKIP — this is the contract
    const dstPath = join(installDir, rel);
    mkdirSync(dirname(dstPath), { recursive: true });
    copyFileSync(srcPath, dstPath);
  });

  // Assert: code files updated
  check('VERSION updated to 2.1.0',
    readFileSync(join(installDir, 'VERSION'), 'utf-8') === '2.1.0\n');
  check('scripts/setup.js updated',
    readFileSync(join(installDir, 'scripts/setup.js'), 'utf-8') === '// new setup\n');
  check('centre/server.js updated',
    readFileSync(join(installDir, 'centre/server.js'), 'utf-8') === '// new server\n');
  check('README.md updated',
    readFileSync(join(installDir, 'README.md'), 'utf-8') === '# robOS new\n');

  // Assert: user data PRESERVED
  for (const [rel, expected] of Object.entries(userFiles)) {
    const actual = readFileSync(join(installDir, rel), 'utf-8');
    check(`user data preserved: ${rel}`, actual === expected,
      `content drifted: expected ${JSON.stringify(expected.slice(0, 30))}, got ${JSON.stringify(actual.slice(0, 30))}`);
  }
} finally {
  rmSync(TMP, { recursive: true, force: true });
}

// --- Test 4: update.js still imports from lib (no drift) ---
console.log('\n--- update.js source check ---');
{
  const updateSrc = readFileSync(join(ROBOS_ROOT, 'scripts', 'update.js'), 'utf-8');
  check(
    'update.js imports PROTECTED_PATHS + isProtected from ./lib/protected-paths.js',
    /from ['"]\.\/lib\/protected-paths\.js['"]/.test(updateSrc)
  );
  check(
    'update.js does NOT redefine PROTECTED_PATHS locally',
    !/^const PROTECTED_PATHS\s*=\s*\[/m.test(updateSrc),
    'a local redefinition would shadow the lib import'
  );
  check(
    'update.js does NOT redefine isProtected locally',
    !/^function isProtected\s*\(/m.test(updateSrc),
    'a local redefinition would shadow the lib import'
  );
  check(
    'update.js has main() guard against accidental import-time execution',
    /__invokedFile === __thisFile/.test(updateSrc),
    'guard required so smokes can import without firing the update flow'
  );
}

console.log('\n=========================');
console.log(`PASSED: ${pass}`);
console.log(`FAILED: ${fail}`);
console.log('=========================');
process.exit(fail > 0 ? 1 : 0);
