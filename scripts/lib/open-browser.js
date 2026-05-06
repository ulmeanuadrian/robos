// Cross-platform browser opener. Best-effort, never throws.

import { spawn } from 'node:child_process';
import { platform } from 'node:os';

export function openBrowser(url) {
  try {
    const p = platform();
    if (p === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else if (p === 'win32') {
      // start "" "url" via cmd; "" is the window title placeholder.
      spawn('cmd', ['/c', 'start', '""', url], { detached: true, stdio: 'ignore', shell: false }).unref();
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
    return true;
  } catch {
    return false;
  }
}
