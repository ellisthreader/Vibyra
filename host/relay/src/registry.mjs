import { createHash, timingSafeEqual } from 'node:crypto';

export function tokenVerifier(mapping) {
  const entries = Object.entries(mapping);
  if (!entries.length || entries.some(([id, hash]) => !/^[a-zA-Z0-9_-]{1,128}$/.test(id) || !/^[a-f0-9]{64}$/.test(hash))) {
    throw new Error('Configure VIBYRA_RELAY_HOST_TOKENS with host IDs and SHA-256 token hashes.');
  }
  return (id, token) => {
    if (typeof token !== 'string' || token.length < 32 || token.length > 256) return false;
    const expected = mapping[id];
    if (!expected) return false;
    const digest = createHash('sha256').update(token).digest();
    return timingSafeEqual(digest, Buffer.from(expected, 'hex'));
  };
}

export function send(socket, message) {
  if (socket.readyState !== 1) return false;
  if (socket.bufferedAmount > 1024 * 1024) {
    socket.close(1013, 'Slow receiver');
    return false;
  }
  socket.send(JSON.stringify(message));
  return true;
}

export function validFrame(value) {
  return typeof value === 'string' && value.length <= 88000 && value.length > 0 &&
    value.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(value);
}
