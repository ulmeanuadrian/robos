import { addSseClient, sendKeepalive } from '../lib/event-bus.js';

/**
 * GET /api/events — Server-Sent Events stream
 */
export function handleSse(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  // Initial connection event
  res.write(`event: connected\ndata: ${JSON.stringify({ time: new Date().toISOString() })}\n\n`);

  // Register client
  addSseClient(res);

  // Keepalive every 30s
  const keepaliveInterval = setInterval(() => {
    sendKeepalive();
  }, 30000);

  req.on('close', () => {
    clearInterval(keepaliveInterval);
  });
}
