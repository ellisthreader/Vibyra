export interface Pairing {
  version: 1;
  hostId: string;
  name: string;
  publicKey: string;
  url: string;
  route?: 'direct' | 'relay';
  network?: 'lan';
  /** Built from a Bonjour result rather than a code, so this computer is
   *  expected to ask its owner for approval instead of consuming an invite. */
  nearby?: boolean;
  invite?: string;
  expiresAt?: string | number;
}

export function parsePairing(link: string, now = Date.now()): Pairing {
  if (link.length > 8192) throw new Error('This pairing code is too long.');
  let data: unknown;
  try {
    if (link.trim().startsWith('{')) data = JSON.parse(link);
    else {
      const uri = new URL(link);
      if (uri.protocol !== 'vibyra:' || uri.hostname !== 'pair') throw new Error();
      const raw = uri.searchParams.get('data');
      if (!raw) throw new Error();
      const encoded = raw.replace(/-/g, '+').replace(/_/g, '/');
      data = JSON.parse(decodeURIComponent(Array.from(atob(encoded), c =>
        `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join('')));
    }
  } catch { throw new Error('Scan or paste a Vibyra pairing code from your computer.'); }
  const value = data as Pairing;
  if (!value || value.version !== 1 || typeof value.hostId !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(value.hostId) || typeof value.name !== 'string' ||
    value.name.length > 128 || !/^[a-f0-9]{64}$/.test(value.publicKey)) {
    throw new Error('This pairing code uses an unsupported connection format.');
  }
  let url: URL;
  try { if (typeof value.url !== 'string') throw new Error(); url = new URL(value.url); }
  catch { throw new Error('This computer has an invalid connection address.'); }
  if (url.username || url.password || url.hash || !['ws:', 'wss:'].includes(url.protocol)) {
    throw new Error('This computer has an invalid connection address.');
  }
  if (value.route !== undefined && !['direct', 'relay'].includes(value.route)) throw new Error('Unsupported route.');
  if (value.network !== undefined && value.network !== 'lan') throw new Error('Unsupported network scope.');
  // Discovery only ever claims a direct connection on this Wi-Fi. A code that
  // arrived from anywhere else may not borrow the nearby approval flow.
  if (value.nearby !== undefined && (value.nearby !== true || value.route !== 'direct' || value.network !== 'lan')) {
    throw new Error('This connection cannot use nearby pairing.');
  }
  const local = /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+|\[::1\])$/.test(url.hostname);
  // IPv6 LAN addresses may be globally allocated. Only an explicitly local,
  // direct invitation may use them without TLS; Noise still authenticates and
  // encrypts every payload and the embedded Host filters peers to its LAN /64.
  const lanV6 = value.network === 'lan' && value.route === 'direct'
    && /^\[(?:[23][0-9a-f]{3}:|f[cd][0-9a-f]{2}:)/i.test(url.hostname);
  if (url.protocol === 'ws:' && ((!local && !lanV6) || value.route === 'relay')) {
    throw new Error('Internet connections require a secure wss address.');
  }
  if (value.invite !== undefined) {
    if (typeof value.invite !== 'string' || value.invite.length < 16 || value.invite.length > 256) {
      throw new Error('This pairing code contains an invalid invitation.');
    }
    const expires = typeof value.expiresAt === 'number' ? value.expiresAt : Date.parse(value.expiresAt ?? '');
    if (!Number.isFinite(expires) || expires <= now) throw new Error('This pairing code expired. Create a new one on your computer.');
  }
  return value;
}
