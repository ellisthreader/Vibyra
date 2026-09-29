import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { send, validFrame } from './registry.mjs';
import { createAdmission } from './admission.mjs';

// Pairs authenticated sockets and forwards opaque end-to-end encrypted frames.
export function attachRelay(server, verify, options = {}) {
  const hosts = new Map();
  const peers = new Set();
  const addresses = new Map();
  const generations = new Map();
  const accountBytes = new Map();
  const metrics = { rateRefusals: 0, capacityRefusals: 0, reconnects: 0 };
  const authorization = options.authorization;
  const admission = createAdmission(options.admission);
  const pacing = options.previewPacingMs === 12 ? 12 : 3;
  const reporter = options.reporter ?? null;
  const maxPeers = options.maxPeers ?? 512;
  const maxHostsPerUser = options.maxHostsPerUser ?? 16;
  const wss = new WebSocketServer({ noServer: true, maxPayload: 90000, perMessageDeflate: false });
  const upgrade = (req, socket, head) => {
    if (peers.size >= maxPeers || !admission.accept(req)) {
      metrics.capacityRefusals++; socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n'); return;
    }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  };
  server.on('upgrade', upgrade);

  function refuse(socket, message, code = 1008) {
    send(socket, { type: 'error', message });
    socket.close(code, message.slice(0, 120));
  }
  function detachHost(host, reason) {
    if (hosts.get(host.id) !== host) return;
    hosts.delete(host.id);
    for (const client of host.clients.values()) client.socket.close(1012, reason);
    reporter?.hostOffline(host.id, host.userId, host.generation);
  }
  function registerHost(socket, msg) {
    const claims = verify('host', msg.hostId, msg.token);
    if (!claims) throw new Error('This computer is not allowed on the relay. Sign in again on the computer.');
    const owned = [...hosts.values()].filter(host => host.userId === claims.userId && host.id !== msg.hostId);
    if (owned.length >= maxHostsPerUser) throw new Error('Too many computers are registered for this account.');
    // A computer that comes back after its network dropped takes its own place;
    // the socket it left behind can look alive here for a long while.
    const previous = hosts.get(msg.hostId);
    if (previous && previous.generation > (claims.generation ?? 0)) throw new Error('Authorization expired');
    if (previous) {
      metrics.reconnects++;
      hosts.delete(msg.hostId);
      previous.stale = true;
      // Its client sockets refer to the old Host object. Closing only the Host
      // leaves those phones apparently connected with nowhere to send frames.
      for (const client of previous.clients.values()) client.socket.close(1012, 'Computer reconnected');
      previous.socket.close(1012, 'Registered again');
      if ((previous.userId !== claims.userId || previous.generation !== (claims.generation ?? 0))) reporter?.hostOffline(previous.id, previous.userId, previous.generation);
    }
    const host = { socket, id: msg.hostId, userId: claims.userId, clients: new Map(), stale: false, generation: claims.generation ?? 0 };
    hosts.set(host.id, host);
    if (!previous || previous.userId !== host.userId || previous.generation !== host.generation) reporter?.hostOnline(host.id, host.userId, host.generation);
    send(socket, { type: 'host.ready', hostId: host.id, previewPacingMs: pacing });
    return host;
  }
  function connectClient(socket, msg) {
    const claims = verify('client', msg.hostId, msg.token);
    if (!claims) throw new Error('This connection has expired. Open the computer again from your phone.');
    const host = hosts.get(msg.hostId);
    if (!host || host.userId !== claims.userId || host.generation !== (claims.generation ?? 0)) throw new Error('That computer is not online. Open Vibyra on it and keep it awake.');
    if (host.clients.size >= 8) throw new Error('Too many phones are connected to that computer.');
    const clientId = randomUUID();
    host.clients.set(clientId, { socket, jti: claims.jti ?? null, accessUntil: claims.accessUntil ?? null });
    send(host.socket, { type: 'client.open', clientId, name: typeof msg.name === 'string' ? msg.name.slice(0, 80) : undefined });
    send(socket, { type: 'client.ready', clientId, previewPacingMs: pacing });
    reporter?.sessionStarted(host.id, host.userId, clientId, claims.jti ?? null, host.generation);
    return { host, clientId };
  }

  wss.on('connection', (socket, req) => {
    const ip = req.socket.remoteAddress;
    socket.on('error', () => socket.terminate());
    admission.track(socket);
    if (peers.size >= maxPeers) { metrics.capacityRefusals++; return socket.close(1013, 'Capacity'); }
    addresses.set(ip, (addresses.get(ip) ?? 0) + 1);
    peers.add(socket);
    let role, host, clientId, leaseTimer, authorizationId;
    let authenticating = false;
    const scheduleLease = () => {
      const until = role === 'client' ? host?.clients.get(clientId)?.accessUntil : null;
      if (typeof until !== 'number') return;
      const remaining = until * 1000 - Date.now();
      if (remaining <= 0) return refuse(socket, 'Your remote membership has ended. Local work continues.');
      leaseTimer = setTimeout(scheduleLease, Math.min(remaining, 86400000));
    };
    let alive = true;
    let controlAllowance = 120;
    let frameAllowance = 2048;
    let frameBytes = 0;
    let windowStart = Date.now();
    const timer = setTimeout(() => refuse(socket, 'Registration required'), 10000);
    const heartbeat = setInterval(() => {
      const until = role === 'client' ? host?.clients.get(clientId)?.accessUntil : null;
      if (typeof until === 'number' && Date.now() >= until * 1000) return refuse(socket, 'Your remote membership has ended. Local work continues.');
      if (!alive) return socket.terminate();
      alive = false;
      socket.ping();
    }, 30000);
    socket.on('pong', () => { alive = true; });
    socket.on('message', async (raw, binary) => {
      try {
        if (socket.readyState !== 1) return;
        if (authenticating) throw new Error('Registration in progress');
        if (binary) throw new Error('Envelope required');
        if (Date.now() - windowStart >= 1000) {
          controlAllowance = 120; frameAllowance = 2048; frameBytes = 0; windowStart = Date.now();
        }
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'frame') {
          frameBytes += raw.length;
          if (--frameAllowance < 0 || frameBytes > 16 * 1024 * 1024) throw new Error('Rate limit');
        } else if (--controlAllowance < 0) throw new Error('Rate limit');
        if (!role) {
          const requestedRole = msg.type === 'host.register' ? 'host' : msg.type === 'client.connect' ? 'client' : null;
          const claims = requestedRole && verify(requestedRole, msg.hostId, msg.token);
          if (!claims || (claims.generation ?? 0) < (generations.get(msg.hostId)?.generation ?? 0)) throw new Error('Authorization expired');
          if (authorization) {
            authenticating = true;
            authorizationId = await authorization.admit(msg.token);
            authenticating = false;
            if (socket.readyState !== 1) { authorization.release(authorizationId); return; }
            if (!authorizationId || (claims.generation ?? 0) < (generations.get(msg.hostId)?.generation ?? 0)) throw new Error('Authorization unavailable or expired');
            authorization.bind(authorizationId, () => refuse(socket, 'Cloud authorization expired. Reconnect to continue.'));
          }
          const liveOwnedPeers = [...hosts.values()].filter(h => h.userId === claims.userId).reduce((sum, h) => sum + 1 + h.clients.size, 0);
          if (liveOwnedPeers >= (options.maxPeersPerAccount ?? 64)) throw new Error('Account capacity');
          admission.authenticated(socket);
          if (msg.type === 'host.register') { host = registerHost(socket, msg); role = 'host'; }
          else if (msg.type === 'client.connect') { ({ host, clientId } = connectClient(socket, msg)); role = 'client'; }
          else throw new Error('Registration required');
          clearTimeout(timer); scheduleLease();
          return;
        }
        if (msg.type === 'frame' && validFrame(msg.data)) {
          const at = Date.now();
          let budget = accountBytes.get(host.userId);
          if (!budget || at - budget.at >= 1000) accountBytes.set(host.userId, budget = { at, bytes: 0 });
          budget.bytes += raw.length;
          if (budget.bytes > (options.accountBytesPerSecond ?? 32 * 1024 * 1024)) throw new Error('Account bandwidth limit');
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
      } catch (error) {
        if (/limit|capacity/i.test(error.message)) metrics.rateRefusals++;
        refuse(socket, error.message || 'Connection rejected');
      }
    });
    socket.on('close', () => {
      authorization?.release(authorizationId);
      clearTimeout(timer); clearTimeout(leaseTimer); clearInterval(heartbeat); peers.delete(socket);
      const count = (addresses.get(ip) ?? 1) - 1;
      if (count) addresses.set(ip, count); else addresses.delete(ip);
      if (role === 'host' && !host.stale) detachHost(host, 'Computer disconnected');
      if (host && ![...hosts.values()].some(h => h.userId === host.userId)) accountBytes.delete(host.userId);
      if (role === 'client') {
        const client = host.clients.get(clientId);
        if (client?.socket === socket) {
          host.clients.delete(clientId);
          send(host.socket, { type: 'client.close', clientId });
          reporter?.sessionEnded(host.id, host.userId, clientId, client.jti, host.generation);
        }
      }
    });
  });

  return {
    presence() { return [...hosts.values()].map(host => ({ hostId: host.id, userId: host.userId, clients: host.clients.size })); },
    diagnostics() { return { ...metrics, admissionRefusals: admission.metrics.refused, peers: peers.size, hosts: hosts.size, bufferedBytes: [...peers].reduce((sum, socket) => sum + socket.bufferedAmount, 0) }; },
    disconnect({ hostId, clientId, generation }) {
      if (Number.isSafeInteger(generation) && generation > 0) {
        for (const [id, fence] of generations) if (Date.now() - fence.at > 180000) generations.delete(id);
        if (!generations.has(hostId) && generations.size >= 4096) throw new Error('Revocation capacity');
        generations.set(hostId, { generation: Math.max(generation, generations.get(hostId)?.generation ?? 0), at: Date.now() });
      }
      const host = hosts.get(hostId);
      if (!host) return Number.isSafeInteger(generation);
      if (Number.isSafeInteger(generation) && host.generation >= generation) return true;
      if (clientId) { const client = host.clients.get(clientId); client?.socket.close(1000, 'Disconnected by the account'); return Boolean(client); }
      host.socket.close(1008, 'Disconnected by the account');
      detachHost(host, 'Disconnected by the account');
      return true;
    },
    close() { server.off('upgrade', upgrade); for (const peer of peers) peer.terminate(); wss.close(); },
  };
}
