import { EventEmitter } from 'events';

const emitter = new EventEmitter();
emitter.setMaxListeners(100);

/**
 * Subscribe la un eveniment intern (nu SSE). Returneaza un unsubscribe.
 */
export function on(event, handler) {
  emitter.on(event, handler);
  return () => emitter.off(event, handler);
}

/**
 * Asteapta un eveniment intern cu timeout. Returneaza data evenimentului sau null la timeout.
 * Filter optional: doar primul eveniment care matches predicate.
 */
export function once(event, { timeout = 2000, filter = null } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const handler = (data) => {
      if (filter && !filter(data)) return;
      if (done) return;
      done = true;
      emitter.off(event, handler);
      clearTimeout(timer);
      resolve(data);
    };
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      emitter.off(event, handler);
      resolve(null);
    }, timeout);
    emitter.on(event, handler);
  });
}

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
