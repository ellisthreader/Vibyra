// API state is durable. These bounded fences cover a successful API admission
// racing an admin revocation on this process, including an absent host/client.
export function createRevocations(hosts, detachHost, { now = Date.now, capacity = 4096,
  retentionMs = 8 * 60 * 1000 } = {}) {
  const generations = new Map();
  const grants = new Map();
  const grantKey = (hostId, grantId) => JSON.stringify([hostId, grantId]);
  function remember(map, key, value) {
    const at = now();
    for (const [id, entry] of map) if (at - entry.at >= retentionMs) map.delete(id);
    if (!map.has(key) && map.size >= capacity) throw new Error('Revocation capacity');
    map.set(key, { ...value, at });
  }
  return {
    stale(claims) {
      return (claims.generation ?? 0) < (generations.get(claims.hostId)?.generation ?? 0) ||
        (claims.jti != null && grants.has(grantKey(claims.hostId, claims.jti)));
    },
    disconnect({ hostId, clientId, grantId, generation }) {
      if (typeof hostId !== 'string' || !/^[A-Za-z0-9_:-]{1,128}$/.test(hostId)) throw new Error('Invalid host');
      if (grantId !== undefined && (typeof grantId !== 'string' || !/^[A-Za-z0-9_:-]{1,128}$/.test(grantId))) throw new Error('Invalid grant');
      if (grantId) remember(grants, grantKey(hostId, grantId), {});
      if (Number.isSafeInteger(generation) && generation > 0)
        remember(generations, hostId, { generation: Math.max(generation, generations.get(hostId)?.generation ?? 0) });
      const host = hosts.get(hostId);
      if (!host) return Boolean(grantId) || Number.isSafeInteger(generation);
      if (grantId) {
        for (const client of host.clients.values()) if (client.jti === grantId) client.socket.close(1000, 'Disconnected by the account');
        return true;
      }
      if (Number.isSafeInteger(generation) && host.generation >= generation) return true;
      if (clientId) { const client = host.clients.get(clientId); client?.socket.close(1000, 'Disconnected by the account'); return Boolean(client); }
      host.socket.close(1008, 'Disconnected by the account');
      detachHost(host, 'Disconnected by the account');
      return true;
    },
  };
}
