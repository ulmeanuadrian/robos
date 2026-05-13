#!/usr/bin/env node
/**
 * smoke-hook-shell-resolve.js — Pin: hook commands din .claude/settings.json
 * trebuie sa REZOLVE corect indiferent de shell-ul folosit de Claude Code.
 *
 * Bug istoric (2 studenti, 2026-05-12 si 2026-05-13):
 *   .claude/settings.json folosea `node "$CLAUDE_PROJECT_DIR/scripts/X.js"`.
 *   Pe PowerShell, `$CLAUDE_PROJECT_DIR` e variabila bash → undefined → empty.
 *   Node primea `/scripts/X.js` si rezolva la `C:\scripts\X.js` (drive root).
 *   Toate hook-urile esuau cu "Cannot find module 'C:\\scripts\\...'".
 *   Admin nu vedea bug-ul pentru ca avea git-bash in PATH.
 *
 * Smoke-ul are 2 stratui:
 *   1. LINT — niciun command in settings.json sa NU contina sintaxe bash-only
 *      (`$VAR`, `${VAR}`). Path-uri relative sunt OK (CWD = project root).
 *   2. FUNCTIONAL — pentru fiecare command, invoke-uieste via shell-ul OS-ului
 *      curent cu CWD=ROOT si verifica exit 0 + no "Cannot find module".
 *      Pe Windows, repeta si prin PowerShell explicit (Claude Code prefera
 *      PowerShell pe instalari fresh fara git-bash).
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { platform } from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const ROBOS_ROOT = join(dirname(__filename), '..');
const SETTINGS_PATH = join(ROBOS_ROOT, '.claude', 'settings.json');

let pass = 0, fail = 0;
function check(label, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`); }
}

function collectCommands(settings) {
  const out = [];
  const hooks = settings.hooks || {};
  for (const event of Object.keys(hooks)) {
    for (const group of hooks[event]) {
      for (const h of (group.hooks || [])) {
        if (h.type === 'command' && h.command) {
          out.push({ event, command: h.command });
        }
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1. Settings file exists + parses
// ---------------------------------------------------------------------------
console.log('--- Hook command shell-resolution smoke ---\n');

if (!existsSync(SETTINGS_PATH)) {
  console.log('  FAIL  .claude/settings.json missing');
  process.exit(1);
}

let settings;
try {
  settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8'));
  check('.claude/settings.json parses as JSON', true);
} catch (e) {
  check('.claude/settings.json parses as JSON', false, e.message);
  process.exit(1);
}

const commands = collectCommands(settings);
check(`hooks declared (found ${commands.length})`, commands.length > 0,
  'expected at least UserPromptSubmit + Stop hooks');

// ---------------------------------------------------------------------------
// 2. LINT — no bash-only variable expansion in commands
// ---------------------------------------------------------------------------
console.log('\n--- Lint: bash-only syntax in commands ---');

// Pattern: `$WORD` or `${WORD}` outside of single quotes. We approximate by
// checking for any `$` followed by `{` or an uppercase/underscore letter — that
// covers `$VAR`, `${VAR}`, `$_VAR` etc. Empty string `$` alone is fine.
const BASH_VAR_PATTERN = /\$\{|\$[A-Z_]/;

for (const { event, command } of commands) {
  const hasBashVar = BASH_VAR_PATTERN.test(command);
  check(
    `[${event}] no bash-only variable expansion`,
    !hasBashVar,
    hasBashVar ? `command contains $VAR / \${VAR} — breaks on PowerShell/cmd: "${command}"` : null,
  );
}

// ---------------------------------------------------------------------------
// 3. LINT — every referenced script path resolves on disk
// ---------------------------------------------------------------------------
console.log('\n--- Lint: script paths exist on disk ---');

for (const { event, command } of commands) {
  // Match the second token (assumed to be a script path) — works for `node X.js` form.
  // We tolerate quotes around the path.
  const m = command.match(/^\s*node\s+"?([^"\s]+\.js)"?/);
  if (!m) {
    check(`[${event}] command parseable as 'node <script>.js'`, false, `cannot extract script: "${command}"`);
    continue;
  }
  const scriptRel = m[1];
  // Resolve relative to ROOT (relies on CWD=ROOT at hook spawn time)
  const scriptAbs = join(ROBOS_ROOT, scriptRel);
  check(
    `[${event}] script exists: ${scriptRel}`,
    existsSync(scriptAbs),
    existsSync(scriptAbs) ? null : `resolved to ${scriptAbs}`,
  );
}

// ---------------------------------------------------------------------------
// 4. FUNCTIONAL — invoke each command via OS default shell with CWD=ROOT
// ---------------------------------------------------------------------------
console.log('\n--- Functional: spawn via shell (CWD=ROBOS_ROOT) ---');

// Mock payload — minimal, hooks should not block on it.
const MOCK_PAYLOAD = JSON.stringify({
  session_id: 'smoke-hook-shell-resolve',
  prompt: 'hello',
  cwd: ROBOS_ROOT,
  tool_name: 'Read',
  tool_input: { file_path: 'README.md' },
  tool_response: { content: 'fixture' },
});

function invokeWithShell(command, shellOverride) {
  const result = spawnSync(command, [], {
    shell: shellOverride || true, // true = OS default (cmd on Windows, sh on Unix)
    cwd: ROBOS_ROOT,
    input: MOCK_PAYLOAD,
    encoding: 'utf-8',
    timeout: 10_000,
    // Ensure CLAUDE_PROJECT_DIR is NOT set — we want to detect commands that
    // accidentally depend on it. If the hook needs to know project dir, it can
    // use __dirname / import.meta.url.
    env: { ...process.env, CLAUDE_PROJECT_DIR: undefined },
  });
  return result;
}

// On Windows, try BOTH cmd.exe (default for shell:true) AND PowerShell.
// On Unix, just default shell.
const shellsToTry = platform() === 'win32'
  ? [
      { label: 'cmd.exe', shell: true },
      { label: 'powershell', shell: 'powershell.exe' },
    ]
  : [
      { label: 'sh', shell: true },
    ];

for (const { event, command } of commands) {
  for (const { label, shell } of shellsToTry) {
    const r = invokeWithShell(command, shell);
    const stderr = (r.stderr || '').toString();
    const cannotFind = /Cannot find module/i.test(stderr);
    const nonZero = r.status !== 0;
    // Pass if exit 0 AND no "Cannot find module"
    check(
      `[${event}] via ${label}: resolves + exits 0`,
      !cannotFind && !nonZero,
      cannotFind
        ? `node cannot find script — likely shell variable not expanded`
        : nonZero
          ? `exit ${r.status}, stderr: ${stderr.slice(0, 160)}`
          : null,
    );
  }
}

// ---------------------------------------------------------------------------
console.log('\n=========================');
console.log(`PASSED: ${pass}`);
console.log(`FAILED: ${fail}`);
console.log('=========================');
process.exit(fail > 0 ? 1 : 0);
