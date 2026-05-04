import { EventEmitter } from 'events';

const emitter = new EventEmitter();
emitter.setMaxListeners(100);

/** @type {Set<import('http').ServerResponse>} */
const sseClients = new Set();

/**
 * Register an SSE client response.
 */
export function addSseClient(res) {
  sseClients.add(res);
  res.on('close', () => sseClients.delete(res));
}

/**
 * Emit an event to all connected SSE clients.
 * @param {string} event - Event name
 * @param {any} data - Event data (will be JSON serialized)
 */
export function emit(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
  emitter.emit(event, data);
}

/**
 * Send keepalive to all SSE clients.
 */
export function sendKeepalive() {
  const payload = `:keepalive\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

// Global keepalive - one interval for all clients
setInterval(() => {
  if (sseClients.size > 0) sendKeepalive();
}, 30000);
