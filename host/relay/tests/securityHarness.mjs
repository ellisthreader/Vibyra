import { once } from 'node:events';
import WebSocket from 'ws';
import { startRelay } from '../src/main.mjs';
import { signToken } from '../src/tokens.mjs';

export const SECRET = 'relay-security-tests-secret-0123456789abcdef';
export const HOST = 'c'.repeat(64);
export const token = (role, extra = {}) => signToken(SECRET, {
  role, hostId: HOST, userId: 'owner', generation: 1,
  exp: Math.floor(Date.now() / 1000) + 300, ...extra,
});
export async function running(env = {}, options = { authorization: null }) {
  const relay = startRelay({ VIBYRA_RELAY_SECRET: SECRET, ...env }, false, options);
  await new Promise(resolve => relay.server.listen(0, '127.0.0.1', resolve));
  return { ...relay, url: `ws://127.0.0.1:${relay.server.address().port}` };
}
export async function open(url, options) {
  const socket = new WebSocket(url, options);
  await once(socket, 'open');
  const messages = [], waiters = [];
  socket.on('message', raw => {
    const value = JSON.parse(raw.toString());
    if (waiters.length) waiters.shift()(value); else messages.push(value);
  });
  const next = () => messages.length ? Promise.resolve(messages.shift()) : new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Message timeout')), 3000);
    waiters.push(value => { clearTimeout(timer); resolve(value); });
  });
  const closed = new Promise(resolve => socket.once('close', (code, reason) => resolve({ code, reason: reason.toString() })));
  return { socket, next, closed, send: value => socket.send(JSON.stringify(value)) };
}
export async function hostOn(relay) {
  const host = await open(relay.url);
  host.send({ type: 'host.register', hostId: HOST, token: token('host') });
  await host.next();
  return host;
}
export async function phoneOn(relay, host, jti, extra) {
  const phone = await open(relay.url);
  phone.send({ type: 'client.connect', hostId: HOST, token: token('client', { jti, ...extra }) });
  const ready = await phone.next();
  await host.next();
  return { ...phone, clientId: ready.clientId };
}
