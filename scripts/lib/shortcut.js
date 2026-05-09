// Cross-platform shortcut install/uninstall.
//
// Goal: make `robos` work from any directory.
//
// Strategy:
//   Mac/Linux: append `alias robos="node /abs/path/scripts/robos.js"` to user's
//     shell rc file (zsh/bash auto-detected from $SHELL). Idempotent via marker.
//   Windows: append `function robos { node "C:\path" $args }` to PowerShell
//     $PROFILE. Works for both Windows PowerShell 5 and PowerShell 7 (different
//     profile paths — we install in BOTH if both exist).
//
// Why this approach over PATH addition:
//   - PATH on Windows has 1024-char limit via setx, easy to corrupt
//   - rc-file alias / PS profile function: no length limit, easy to remove
//   - User can always inspect the rc file/profile to see exactly what we added

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir, platform } from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const ROBOS_JS = join(ROOT, 'scripts', 'robos.js');

const MARKER_BEGIN = '# >>> robos shortcut >>>';
const MARKER_END = '# <<< robos shortcut <<<';
const PS_MARKER_BEGIN = '# >>> robos shortcut >>>';
const PS_MARKER_END = '# <<< robos shortcut <<<';

// ----------------------------------------------------------------------------
// Mac/Linux: shell rc file
// ----------------------------------------------------------------------------

function detectShellRcFile() {
  const shell = process.env.SHELL || '';
  if (shell.includes('zsh')) return join(homedir(), '.zshrc');
  if (shell.includes('bash')) {
    // Mac bash uses .bash_profile, Linux .bashrc
    if (platform() === 'darwin') return join(homedir(), '.bash_profile');
    return join(homedir(), '.bashrc');
  }
  if (shell.includes('fish')) return join(homedir(), '.config', 'fish', 'config.fish');
  // Fallback — most permissive
  return join(homedir(), platform() === 'darwin' ? '.zshrc' : '.bashrc');
}

function buildShellSnippet() {
  return `${MARKER_BEGIN}
# Auto-installed by robOS — to remove, run: node ${ROBOS_JS} --uninstall-shortcut
alias robos='node "${ROBOS_JS}"'
${MARKER_END}`;
}

function appendToFile(path, snippet) {
  // Ensure directory exists (for fish config)
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  let existing = '';
  if (existsSync(path)) existing = readFileSync(path, 'utf-8');

  // Idempotent: if marker exists, replace block
  if (existing.includes(MARKER_BEGIN)) {
    const re = new RegExp(`${escape(MARKER_BEGIN)}[\\s\\S]*?${escape(MARKER_END)}`);
    const next = existing.replace(re, snippet);
    writeFileSync(path, next, 'utf-8');
    return { action: 'updated', path };
  }

  // Append
  const sep = existing.endsWith('\n') || existing === '' ? '' : '\n';
  writeFileSync(path, existing + sep + '\n' + snippet + '\n', 'utf-8');
  return { action: 'appended', path };
}

function removeFromFile(path) {
  if (!existsSync(path)) return { action: 'noop', path };
  const existing = readFileSync(path, 'utf-8');
  if (!existing.includes(MARKER_BEGIN)) return { action: 'noop', path };
  const re = new RegExp(`\\n?${escape(MARKER_BEGIN)}[\\s\\S]*?${escape(MARKER_END)}\\n?`);
  writeFileSync(path, existing.replace(re, ''), 'utf-8');
  return { action: 'removed', path };
}

function escape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ----------------------------------------------------------------------------
// Windows: PowerShell $PROFILE
// ----------------------------------------------------------------------------

function getPowerShellProfilePaths() {
  const paths = [];
  // PowerShell 5 (Windows PowerShell)
  // Use os.homedir() for cross-platform safety. On Windows it returns the same
  // value as %USERPROFILE% but works on Mac/Linux too (lint-portability rule).
  const docs = join(homedir(), 'Documents');
  paths.push({
    label: 'Windows PowerShell 5',
    path: join(docs, 'WindowsPowerShell', 'Microsoft.PowerShell_profile.ps1'),
  });
  // PowerShell 7+
  paths.push({
    label: 'PowerShell 7+',
    path: join(docs, 'PowerShell', 'Microsoft.PowerShell_profile.ps1'),
  });
  return paths;
}

function buildPowerShellSnippet() {
  // Escape backslashes for PowerShell single-quoted strings (no escaping in single quotes — safe)
  return `${PS_MARKER_BEGIN}
# Auto-installed by robOS — to remove, run: node "${ROBOS_JS}" --uninstall-shortcut
function robos { node "${ROBOS_JS}" $args }
${PS_MARKER_END}`;
}

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------

export function isInstalled() {
  if (platform() === 'win32') {
    const profiles = getPowerShellProfilePaths();
    return profiles.some(({ path }) => {
      if (!existsSync(path)) return false;
      return readFileSync(path, 'utf-8').includes(PS_MARKER_BEGIN);
    });
  }
  const rc = detectShellRcFile();
  if (!existsSync(rc)) return false;
  return readFileSync(rc, 'utf-8').includes(MARKER_BEGIN);
}

export function install() {
  const results = [];
  if (platform() === 'win32') {
    const snippet = buildPowerShellSnippet();
    for (const { label, path } of getPowerShellProfilePaths()) {
      try {
        const r = appendToFile(path, snippet);
        results.push({ ...r, label });
      } catch (e) {
        results.push({ action: 'error', path, label, error: e.message });
      }
    }
    return {
      ok: results.some((r) => r.action === 'appended' || r.action === 'updated'),
      results,
      hint: 'Deschide o fereastra noua de PowerShell pentru ca `robos` sa fie disponibil.',
    };
  }

  const rc = detectShellRcFile();
  const snippet = buildShellSnippet();
  try {
    const r = appendToFile(rc, snippet);
    return {
      ok: true,
      results: [r],
      hint: `Restart shell sau ruleaza: source ${rc}`,
    };
  } catch (e) {
    return {
      ok: false,
      results: [{ action: 'error', path: rc, error: e.message }],
      hint: 'Verifica permisiunile pe rc file.',
    };
  }
}

export function uninstall() {
  const results = [];
  if (platform() === 'win32') {
    for (const { label, path } of getPowerShellProfilePaths()) {
      try {
        const r = removeFromFile(path);
        results.push({ ...r, label });
      } catch (e) {
        results.push({ action: 'error', path, label, error: e.message });
      }
    }
    return { ok: true, results };
  }

  const rc = detectShellRcFile();
  try {
    const r = removeFromFile(rc);
    return { ok: true, results: [r] };
  } catch (e) {
    return { ok: false, results: [{ action: 'error', path: rc, error: e.message }] };
  }
}

// CLI entry point: node scripts/lib/shortcut.js {install|uninstall|status}
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && process.argv[1].replace(/\\/g, '/') === __filename.replace(/\\/g, '/')) {
  const cmd = process.argv[2];
  if (cmd === 'install') {
    const r = install();
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
  } else if (cmd === 'uninstall') {
    const r = uninstall();
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
  } else if (cmd === 'status') {
    console.log(JSON.stringify({ installed: isInstalled() }, null, 2));
  } else {
    console.error('Usage: node scripts/lib/shortcut.js {install|uninstall|status}');
    process.exit(1);
  }
}
