import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { send, validFrame } from './registry.mjs';

export function attachRelay(server, verifyHost, options = {}) {
  const hosts = new Map();
  const peers = new Set();
  const addresses = new Map();
  const wss = new WebSocketServer({ server, maxPayload: 90000, perMessageDeflate: false });
  const maxPeers = options.maxPeers ?? 512;
  wss.on('connection', (socket, req) => {
    const ip = req.socket.remoteAddress;
    if (peers.size >= maxPeers || (addresses.get(ip) ?? 0) >= 32) return socket.close(1013, 'Capacity');
    addresses.set(ip, (addresses.get(ip) ?? 0) + 1);
    peers.add(socket);
    let role, host, clientId;
    let alive = true;
    let allowance = 120;
    let windowStart = Date.now();
    const timer = setTimeout(() => socket.close(1008, 'Registration required'), 10000);
    const heartbeat = setInterval(() => {
      if (!alive) return socket.terminate();
      alive = false;
      socket.ping();
    }, 30000);
    socket.on('pong', () => { alive = true; });
    socket.on('message', (raw, binary) => {
      try {
        if (binary) throw new Error('Envelope required');
        if (Date.now() - windowStart >= 1000) { allowance = 120; windowStart = Date.now(); }
        if (--allowance < 0) throw new Error('Rate limit');
        const msg = JSON.parse(raw.toString());
        if (!role) {
          if (msg.type === 'host.register') {
            if (!verifyHost(msg.hostId, msg.token) || hosts.has(msg.hostId)) throw new Error('Host rejected');
            role = 'host';
            host = { socket, id: msg.hostId, clients: new Map() };
            hosts.set(host.id, host);
            send(socket, { type: 'host.ready' });
          } else if (msg.type === 'client.connect') {
            host = hosts.get(msg.hostId);
            if (!host || host.clients.size >= 8) throw new Error('Computer unavailable');
            role = 'client'; clientId = randomUUID(); host.clients.set(clientId, socket);
            send(host.socket, { type: 'client.open', clientId });
            send(socket, { type: 'client.ready', clientId });
          } else throw new Error('Registration required');
          clearTimeout(timer);
          return;
        }
        if (msg.type === 'frame' && validFrame(msg.data)) {
          if (role === 'client') {
            if (msg.clientId !== clientId) throw new Error('Invalid client');
            send(host.socket, { type: 'frame', clientId, data: msg.data });
          } else {
            const client = host.clients.get(msg.clientId);
            if (client) send(client, { type: 'frame', clientId: msg.clientId, data: msg.data });
          }
        } else if (role === 'host' && msg.type === 'client.close') {
          host.clients.get(msg.clientId)?.close(1000, 'Host disconnected');
        } else throw new Error('Invalid envelope');
      } catch { socket.close(1008, 'Connection rejected'); }
    });
    socket.on('error', () => socket.terminate());
    socket.on('close', () => {
      clearTimeout(timer); clearInterval(heartbeat); peers.delete(socket);
      const count = (addresses.get(ip) ?? 1) - 1;
      if (count) addresses.set(ip, count); else addresses.delete(ip);
      if (role === 'host') {
        hosts.delete(host.id);
        for (const client of host.clients.values()) client.close(1012, 'Computer disconnected');
      } else if (role === 'client') {
        host.clients.delete(clientId);
        send(host.socket, { type: 'client.close', clientId });
      }
    });
  });
  return { close() { for (const peer of peers) peer.terminate(); wss.close(); } };
}
