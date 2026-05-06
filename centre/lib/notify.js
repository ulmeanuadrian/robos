// Cross-platform desktop notifications.
//
// Strategy: try `node-notifier` if available (Centre dashboard installs it).
// Fall back to per-OS shell commands (osascript / powershell BurntToast / notify-send).
// All paths are best-effort — never throw, never block.
//
// Use cases:
//   - Cron job completed → notify operator (unless [SILENT] suppression)
//   - Session-close skill → optional confirmation
//   - Future: license expiring soon, update available

import { spawn } from 'node:child_process';
import { platform } from 'node:os';

let _nodeNotifier = null;
let _nodeNotifierTried = false;

async function getNodeNotifier() {
  if (_nodeNotifierTried) return _nodeNotifier;
  _nodeNotifierTried = true;
  try {
    const mod = await import('node-notifier');
    _nodeNotifier = mod.default || mod;
  } catch {
    _nodeNotifier = null;
  }
  return _nodeNotifier;
}

/**
 * Send a notification. Always best-effort, returns boolean for success.
 *
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} opts.message
 * @param {'info'|'success'|'warning'|'failure'} [opts.type]
 */
export async function notify({ title = 'robOS', message = '', type = 'info' } = {}) {
  if (!message) return false;

  const notifier = await getNodeNotifier();
  if (notifier) {
    try {
      notifier.notify({
        title,
        message,
        sound: type === 'failure' || type === 'warning',
        wait: false,
        timeout: 6,
      });
      return true;
    } catch {
      // fall through to OS-specific
    }
  }

  // OS-specific fallback (no deps)
  try {
    const p = platform();
    if (p === 'darwin') {
      const safe = (s) => s.replace(/"/g, '\\"');
      spawn('osascript', ['-e', `display notification "${safe(message)}" with title "${safe(title)}"`], {
        detached: true,
        stdio: 'ignore',
      }).unref();
      return true;
    }
    if (p === 'linux') {
      spawn('notify-send', [title, message], { detached: true, stdio: 'ignore' }).unref();
      return true;
    }
    if (p === 'win32') {
      // PowerShell: use built-in toast via System.Windows.Forms.NotifyIcon (works without modules)
      const ps = `Add-Type -AssemblyName System.Windows.Forms; ` +
        `$n = New-Object System.Windows.Forms.NotifyIcon; ` +
        `$n.Icon = [System.Drawing.SystemIcons]::Information; ` +
        `$n.Visible = $true; ` +
        `$n.ShowBalloonTip(6000, '${title.replace(/'/g, "''")}', '${message.replace(/'/g, "''")}', 'Info'); ` +
        `Start-Sleep -Seconds 2; $n.Dispose()`;
      spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', ps], {
        detached: true,
        stdio: 'ignore',
      }).unref();
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

/**
 * Detect [SILENT] suppression token in cron job output (last 200 chars).
 * Returns true if output ends with [SILENT] (possibly trailing whitespace).
 */
export function isSilentOutput(output) {
  if (!output || typeof output !== 'string') return false;
  const tail = output.slice(-200);
  return /\[SILENT\]\s*$/i.test(tail);
}
