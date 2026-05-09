// Editor detection + open helpers — one-shot first-run UX.
//
// robOS recomanda VSCode pentru ca:
//  - claude in terminal integrat VSCode primeste file context auto
//  - notitele markdown se editeaza placut (preview, outline, search)
//  - dashboard-ul localhost:3001 se deschide cu Ctrl+Click pe link
//
// Detection priority: deja-in-VSCode → `code` available → fallback hint.
// State `editor_offered` in launcher-state.json garantati ca ruleaza o singura data.

import { spawnSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { platform } from 'node:os';

const IS_WIN = platform() === 'win32';
const IS_MAC = platform() === 'darwin';
const MAC_VSCODE_APP = '/Applications/Visual Studio Code.app';

export function isInsideVSCode() {
  return process.env.TERM_PROGRAM === 'vscode' || !!process.env.VSCODE_INJECTION;
}

// Returns one of: 'cli' (code in PATH), 'mac-app' (Mac app installed, no PATH), 'none'.
export function detectVSCode() {
  const cmd = IS_WIN ? 'where' : 'which';
  const cli = spawnSync(cmd, ['code'], { stdio: 'ignore', shell: false });
  if (cli.status === 0) return 'cli';
  if (IS_MAC && existsSync(MAC_VSCODE_APP)) return 'mac-app';
  return 'none';
}

export function openInVSCode(folder, mode) {
  if (mode === 'mac-app') {
    // VSCode installed on Mac without `code` shim — use Launch Services.
    const child = spawn('open', ['-a', 'Visual Studio Code', folder], {
      stdio: 'ignore',
      detached: true,
    });
    child.unref();
    return true;
  }
  // shell: true on Windows so .cmd shim resolves; detached so VSCode survives parent exit.
  const child = spawn('code', [folder], {
    stdio: 'ignore',
    shell: IS_WIN,
    detached: true,
  });
  child.unref();
  return true;
}

// Returns one of: 'opened', 'hinted', 'inside', 'skipped'.
//   inside  — already in VSCode terminal, nothing to do
//   opened  — VSCode found, opened folder, suggest student switches to its terminal
//   hinted  — VSCode missing, printed install hint
//   skipped — caller already offered (state flag set)
export function offerEditor({ folder, alreadyOffered, info }) {
  // Check inside-VSCode before alreadyOffered: chat hint must adapt
  // even on re-launches inside the integrated terminal.
  if (isInsideVSCode()) return 'inside';
  if (alreadyOffered) return 'skipped';

  const detection = detectVSCode();
  if (detection !== 'none') {
    info('Detectat VSCode — deschid robOS in editor (mai placut decat PowerShell sec).');
    info('In VSCode: View → Terminal → ruleaza `claude` acolo, primesti file context auto.');
    openInVSCode(folder, detection);
    return 'opened';
  }

  info('Tip: pentru editare placuta a notitelor + chat Claude integrat,');
  info('instaleaza VSCode (gratis): https://code.visualstudio.com');
  info('Apoi din folder-ul robOS: `code .`');
  return 'hinted';
}
