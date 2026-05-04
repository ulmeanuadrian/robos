import { addSseClient } from '../lib/event-bus.js';

/**
 * GET /api/events — Server-Sent Events stream
 */
export function handleSse(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  res.write(`event: connected\ndata: ${JSON.stringify({ time: new Date().toISOString() })}\n\n`);

  addSseClient(res);
}
