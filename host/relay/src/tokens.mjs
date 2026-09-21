import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

// Relay credentials are short-lived tokens the Vibyra API signs with the secret
// it shares with this relay: `v1.<claims>.<signature>`, both parts base64url.
// The relay keeps no session table and asks the API nothing at connect time; a
// token proves that the API let this account reach this computer a few minutes
// ago, and nothing more. The claims are the whole contract:
//   role    'host' (a computer registering) or 'client' (a phone connecting)
//   hostId  the computer's Noise public key, which is also its identity
//   userId  the account both sides must share
//   exp     unix seconds after which the token is refused
//   jti     the API's own id for this grant, echoed back in events
const ID = /^[a-zA-Z0-9_:-]{1,128}$/;

export function signToken(secret, claims) {
  const body = Buffer.from(JSON.stringify({ v: 1, ...claims })).toString('base64url');
  const signature = createHmac('sha256', secret).update(body).digest('base64url');
  return `v1.${body}.${signature}`;
}

/** The claims of a token this relay's secret signed, or null for anything else. */
export function verifyToken(secret, token, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 4096) return null;
  const [version, body, signature] = token.split('.');
  if (version !== 'v1' || !body || !signature) return null;
  const expected = createHmac('sha256', secret).update(body).digest();
  const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let claims;
  try { claims = JSON.parse(Buffer.from(body, 'base64url').toString()); } catch { return null; }
  if (!claims || claims.v !== 1 || !['host', 'client'].includes(claims.role)) return null;
  if (!ID.test(String(claims.hostId)) || !ID.test(String(claims.userId))) return null;
  if (typeof claims.exp !== 'number' || claims.exp * 1000 <= now) return null;
  return claims;
}

/**
 * The relay's credential check: `(role, hostId, token) -> claims | null`.
 * Signed tokens are the product path. A static map of host ids to SHA-256
 * token digests (`VIBYRA_RELAY_HOST_TOKENS`) stays for a standalone Host run
 * by hand with `--relay-token-file`; it grants a host registration under a
 * synthetic account, so no phone token can ever match it.
 */
export function createVerifier({ secret, staticHosts = {} } = {}) {
  const statics = Object.entries(staticHosts);
  if (!secret && !statics.length) {
    throw new Error('Configure VIBYRA_RELAY_SECRET (shared with the Vibyra API) or VIBYRA_RELAY_HOST_TOKENS.');
  }
  if (secret && secret.length < 32) throw new Error('VIBYRA_RELAY_SECRET must have at least 32 characters.');
  for (const [id, hash] of statics) {
    if (!ID.test(id) || !/^[a-f0-9]{64}$/.test(hash)) throw new Error('VIBYRA_RELAY_HOST_TOKENS must map host ids to SHA-256 hex digests.');
  }
  return (role, hostId, token) => {
    if (secret) {
      const claims = verifyToken(secret, token);
      if (claims && claims.role === role && claims.hostId === hostId) return claims;
    }
    if (role !== 'host' || typeof token !== 'string' || token.length < 32 || token.length > 256) return null;
    const expected = staticHosts[hostId];
    if (!expected) return null;
    const actual = createHash('sha256').update(token).digest();
    if (!timingSafeEqual(actual, Buffer.from(expected, 'hex'))) return null;
    return { v: 1, role: 'host', hostId, userId: `static:${hostId}`, exp: Number.MAX_SAFE_INTEGER, jti: null };
  };
}

/** A constant-time check of the admin secret a request carries. */
export function bearerMatches(header, secret) {
  if (!secret || typeof header !== 'string' || !header.startsWith('Bearer ')) return false;
  const given = Buffer.from(header.slice(7));
  const wanted = Buffer.from(secret);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}
