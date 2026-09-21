import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { send, validFrame } from './registry.mjs';

// One WebSocket endpoint for both sides. A computer registers with a host token
// and holds its socket open; a phone connects with a client token naming that
// computer, and from then on every `frame` is an opaque Noise message forwarded
// between the two. The relay pairs sockets; it never joins the conversation.
//
// A refused registration or connection is answered with an `error` envelope
// before the socket closes, so a phone can say why ("That computer is
// offline") rather than "connection closed".
export function attachRelay(server, verify, options = {}) {
  const hosts = new Map();
  const peers = new Set();
  const addresses = new Map();
  const reporter = options.reporter ?? null;
  const maxPeers = options.maxPeers ?? 512;
  const maxHostsPerUser = options.maxHostsPerUser ?? 16;
  const wss = new WebSocketServer({ server, maxPayload: 90000, perMessageDeflate: false });

  function refuse(socket, message, code = 1008) {
    send(socket, { type: 'error', message });
    socket.close(code, message.slice(0, 120));
  }
  function detachHost(host, reason) {
    if (hosts.get(host.id) !== host) return;
    hosts.delete(host.id);
    for (const client of host.clients.values()) client.socket.close(1012, reason);
    reporter?.hostOffline(host.id, host.userId);
  }
  function registerHost(socket, msg) {
    const claims = verify('host', msg.hostId, msg.token);
    if (!claims) throw new Error('This computer is not allowed on the relay. Sign in again on the computer.');
    const owned = [...hosts.values()].filter(host => host.userId === claims.userId && host.id !== msg.hostId);
    if (owned.length >= maxHostsPerUser) throw new Error('Too many computers are registered for this account.');
    // A computer that comes back after its network dropped takes its own place;
    // the socket it left behind can look alive here for a long while.
    const previous = hosts.get(msg.hostId);
    if (previous) { hosts.delete(msg.hostId); previous.stale = true; previous.socket.close(1012, 'Registered again'); }
    const host = { socket, id: msg.hostId, userId: claims.userId, clients: new Map(), stale: false };
    hosts.set(host.id, host);
    if (!previous) reporter?.hostOnline(host.id, host.userId);
    send(socket, { type: 'host.ready', hostId: host.id });
    return host;
  }
  function connectClient(socket, msg) {
    const claims = verify('client', msg.hostId, msg.token);
    if (!claims) throw new Error('This connection has expired. Open the computer again from your phone.');
    const host = hosts.get(msg.hostId);
    if (!host || host.userId !== claims.userId) throw new Error('That computer is not online. Open Vibyra on it and keep it awake.');
    if (host.clients.size >= 8) throw new Error('Too many phones are connected to that computer.');
    const clientId = randomUUID();
    host.clients.set(clientId, { socket, jti: claims.jti ?? null });
    send(host.socket, { type: 'client.open', clientId, name: typeof msg.name === 'string' ? msg.name.slice(0, 80) : undefined });
    send(socket, { type: 'client.ready', clientId });
    reporter?.sessionStarted(host.id, host.userId, clientId, claims.jti ?? null);
    return { host, clientId };
  }

  wss.on('connection', (socket, req) => {
    const ip = req.socket.remoteAddress;
    if (peers.size >= maxPeers || (addresses.get(ip) ?? 0) >= 32) return socket.close(1013, 'Capacity');
    addresses.set(ip, (addresses.get(ip) ?? 0) + 1);
    peers.add(socket);
    let role, host, clientId;
    let alive = true;
    let allowance = 120;
    let windowStart = Date.now();
    const timer = setTimeout(() => refuse(socket, 'Registration required'), 10000);
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
          if (msg.type === 'host.register') { host = registerHost(socket, msg); role = 'host'; }
          else if (msg.type === 'client.connect') { ({ host, clientId } = connectClient(socket, msg)); role = 'client'; }
          else throw new Error('Registration required');
          clearTimeout(timer);
          return;
        }
        if (msg.type === 'frame' && validFrame(msg.data)) {
          if (role === 'client') {
            if (msg.clientId !== clientId) throw new Error('Invalid client');
            send(host.socket, { type: 'frame', clientId, data: msg.data });
          } else {
            const client = host.clients.get(msg.clientId);
            if (client) send(client.socket, { type: 'frame', clientId: msg.clientId, data: msg.data });
          }
        } else if (role === 'host' && msg.type === 'client.close') {
          host.clients.get(msg.clientId)?.socket.close(1000, 'Host disconnected');
        } else throw new Error('Invalid envelope');
      } catch (error) { refuse(socket, error.message || 'Connection rejected'); }
    });
    socket.on('error', () => socket.terminate());
    socket.on('close', () => {
      clearTimeout(timer); clearInterval(heartbeat); peers.delete(socket);
      const count = (addresses.get(ip) ?? 1) - 1;
      if (count) addresses.set(ip, count); else addresses.delete(ip);
      if (role === 'host' && !host.stale) detachHost(host, 'Computer disconnected');
      else if (role === 'client') {
        const client = host.clients.get(clientId);
        if (client?.socket === socket) {
          host.clients.delete(clientId);
          send(host.socket, { type: 'client.close', clientId });
          reporter?.sessionEnded(host.id, host.userId, clientId, client.jti);
        }
      }
    });
  });

  return {
    /** Every registered computer and how many phones it has, for the admin surface. */
    presence() { return [...hosts.values()].map(host => ({ hostId: host.id, userId: host.userId, clients: host.clients.size })); },
    /** Cuts a computer off (and every phone on it), or one phone. The API calls
     *  this when a computer is removed from an account, so revocation is felt at
     *  once rather than when the next token expires. */
    disconnect({ hostId, clientId }) {
      const host = hosts.get(hostId);
      if (!host) return false;
      if (clientId) { const client = host.clients.get(clientId); client?.socket.close(1000, 'Disconnected by the account'); return Boolean(client); }
      host.socket.close(1008, 'Disconnected by the account');
      detachHost(host, 'Disconnected by the account');
      return true;
    },
    close() { for (const peer of peers) peer.terminate(); wss.close(); },
  };
}
