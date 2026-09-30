/**
 * A stand-in Vibyra for the two-factor fixture: it issues a real base32 secret, and
 * checks codes with the same RFC 6238 arithmetic the backend and every authenticator
 * app use. That is the point — a fixture that accepted any six digits would prove the
 * screens change and nothing about whether the code on them means anything.
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const PERIOD = 30;

export interface ServerState { secret: string | null; enabled: boolean; recoveryCodes: string[]; lastSlot: number | null }

const secret = () => [...crypto.getRandomValues(new Uint8Array(32))].map(byte => ALPHABET[byte & 31]).join('');
const decode = (value: string) => {
  const bits = [...value].map(character => ALPHABET.indexOf(character).toString(2).padStart(5, '0')).join('');
  return Uint8Array.from((bits.match(/.{8}/g) ?? []).map(byte => parseInt(byte, 2)));
};
/** The code for one time slot, exactly as an authenticator app works it out. */
export async function totp(base32: string, slot: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', decode(base32), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const counter = new DataView(new ArrayBuffer(8));
  counter.setUint32(4, slot);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, counter.buffer));
  const offset = mac[19] & 0x0f;
  const value = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(value % 1_000_000).padStart(6, '0');
}
const recovery = () => [...Array(10)].map(() =>
  [...crypto.getRandomValues(new Uint8Array(10))].map(byte => 'abcdefghjkmnpqrstuvwxyz23456789'[byte % 31]).join('')
    .replace(/^(.{5})/, '$1-'));

export function twoFactorServer({ email, enabled, log }: { email: string; enabled: boolean; log: string[] }) {
  const state: ServerState = { secret: enabled ? secret() : null, enabled, recoveryCodes: enabled ? recovery() : [], lastSlot: null };
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const user = () => ({ email, name: 'Ellis', plan: 'pro', provider: 'email', emailVerified: true, twoFactorEnabled: state.enabled });
  /** The app's code for the slot either side of now, each usable once, or a recovery code. */
  const accepts = async (code: string) => {
    const given = code.trim().toLowerCase();
    if (state.secret && /^\d{6}$/.test(given)) {
      const now = Math.floor(Date.now() / 1000 / PERIOD);
      for (const slot of [now - 1, now, now + 1]) {
        if (await totp(state.secret, slot) !== given) continue;
        if (state.lastSlot !== null && slot <= state.lastSlot) return false;
        state.lastSlot = slot;
        return true;
      }
    }
    const at = state.recoveryCodes.indexOf(given);
    if (at < 0) return false;
    state.recoveryCodes.splice(at, 1);
    return true;
  };
  let challenge: string | null = null;
  const fetchImpl = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const path = new URL(String(input)).pathname;
    const method = init.method ?? 'GET';
    log.push(`${method} ${path}`);
    // A real server takes a moment, so busy states are drawn and can be seen.
    await new Promise(resolve => setTimeout(resolve, 120));
    const body = typeof init.body === 'string' ? JSON.parse(init.body) as Record<string, string> : {};
    if (path === '/api/account/2fa' && method === 'GET') return reply(200, { ok: true, enabled: state.enabled,
      available: true, confirmedAt: state.enabled ? new Date().toISOString() : null, recoveryCodesLeft: state.recoveryCodes.length });
    if (path === '/api/account/2fa/start') {
      state.secret = secret(); state.enabled = false; state.lastSlot = null;
      return reply(200, { ok: true, secret: state.secret, account: email,
        uri: `otpauth://totp/Vibyra:${encodeURIComponent(email)}?secret=${state.secret}&issuer=Vibyra&algorithm=SHA1&digits=6&period=30` });
    }
    if (path === '/api/account/2fa/confirm') {
      if (!await accepts(body.code ?? '')) return reply(422, { ok: false, error: 'That code didn’t match. Check your authenticator app and try the current code.' });
      state.enabled = true; state.recoveryCodes = recovery();
      return reply(200, { ok: true, recoveryCodes: state.recoveryCodes, user: user() });
    }
    if (path === '/api/account/2fa/recovery') {
      if (!await accepts(body.code ?? '')) return reply(422, { ok: false, error: 'Enter the current code from your authenticator app.' });
      state.recoveryCodes = recovery();
      return reply(200, { ok: true, recoveryCodes: state.recoveryCodes });
    }
    if (path === '/api/account/2fa' && method === 'DELETE') {
      if (!await accepts(body.code ?? '')) return reply(422, { ok: false, error: 'Enter a code from your authenticator app, or one of your recovery codes.' });
      state.enabled = false; state.secret = null; state.recoveryCodes = [];
      return reply(200, { ok: true, user: user() });
    }
    if (path === '/api/auth/login') {
      if (body.password !== 'secret123') return reply(401, { ok: false, error: 'Email or password is incorrect.' });
      if (!state.enabled) return reply(200, { ok: true, token: 'tok', user: user() });
      challenge = 'challenge-1';
      return reply(200, { ok: true, twoFactor: { challengeId: challenge, expiresIn: 300 } });
    }
    if (path === '/api/auth/login/2fa') {
      if (body.challengeId !== challenge || !await accepts(body.code ?? ''))
        return reply(401, { ok: false, error: 'That code didn’t match. Try the current code from your authenticator app.' });
      challenge = null;
      return reply(200, { ok: true, token: 'tok', user: user() });
    }
    if (path === '/api/session') return reply(200, { ok: true, user: user() });
    if (path === '/api/account/sessions') return reply(200, { ok: true, devices: [
      { id: 'this-phone', deviceName: 'iPhone', location: 'London, GB', updatedAt: new Date().toISOString(), current: true }], sessions: [] });
    return reply(404, { ok: false, error: 'Not Found' });
  };
  return { state, fetch: fetchImpl };
}
