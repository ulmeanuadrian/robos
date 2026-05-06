// HTTP probe — checks if a port responds via http.get without dependencies.
// Used by scripts/robos.js to detect if dashboard is already running.

import http from 'node:http';

export function probe(port, host = '127.0.0.1', timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get({ host, port, path: '/', timeout: timeoutMs }, (res) => {
      // Any HTTP response (200, 404, anything) means something is listening.
      res.resume();
      resolve({ alive: true, status: res.statusCode });
    });
    req.on('error', () => resolve({ alive: false, status: 0 }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ alive: false, status: 0 });
    });
  });
}
