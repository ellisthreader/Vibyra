import test from 'node:test';
import assert from 'node:assert/strict';
import { AccountError, createAccountApi } from '../src/account/accountApi';
import { finishedAnyway } from '../src/account/deletionCheck';
import { activeLabel } from '../src/settings/activeLabel';

const user = { id: 1, email: 'ellis@example.com', name: 'Ellis', plan: 'pro', provider: 'email', emailVerified: true,
  avatarUrl: 'https://api.example.test/api/account/avatar/1?v=abc&signature=x' };
type Reply = { status: number; body?: unknown };
function fakeFetch(handler: (url: string, init: RequestInit) => Reply) {
  const requests: { url: string; init: RequestInit }[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input); requests.push({ url, init: init ?? {} });
    const result = handler(url, init ?? {});
    return new Response(result.body === undefined ? 'not json' : JSON.stringify(result.body), { status: result.status });
  }) as typeof fetch;
  return { requests, api: createAccountApi({ baseUrl: 'https://api.example.test', deviceName: 'iPhone', fetch: impl }) };
}
const headers = (init: RequestInit) => init.headers as Record<string, string>;

test('the account keeps its photo, sign-in method and confirmation state, and only those it was sent', async () => {
  const { api } = fakeFetch(() => ({ status: 200, body: { ok: true, user } }));
  const account = await api.session('tok');
  assert.deepEqual(account, { email: user.email, name: 'Ellis', plan: 'pro', avatarUrl: user.avatarUrl, provider: 'email', emailVerified: true });
  const bare = fakeFetch(() => ({ status: 200, body: { ok: true, user: { email: 'a@b.co', name: 'A', plan: 'free', avatarUrl: null } } }));
  assert.deepEqual(await bare.api.session('tok'), { email: 'a@b.co', name: 'A', plan: 'free', avatarUrl: null });
});
test('a name change posts only the name with the bearer and returns the new account', async () => {
  const { api, requests } = fakeFetch(() => ({ status: 200, body: { ok: true, user: { ...user, name: 'Ellis T' } } }));
  assert.equal((await api.updateProfile('tok', { name: 'Ellis T' })).name, 'Ellis T');
  assert.equal(requests[0].url, 'https://api.example.test/api/account/profile');
  assert.equal(requests[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(String(requests[0].init.body)), { name: 'Ellis T' });
  assert.equal(headers(requests[0].init).Authorization, 'Bearer tok');
});
test('a browser photo is read into a file part named photo; nothing sets its own multipart boundary', async () => {
  const { api, requests } = fakeFetch(() => ({ status: 200, body: { ok: true, user } }));
  const photo = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64');
  assert.equal((await api.uploadAvatar('tok', photo)).avatarUrl, user.avatarUrl);
  assert.equal(requests[0].url, 'https://api.example.test/api/account/avatar');
  const form = requests[0].init.body as FormData;
  const part = form.get('photo') as File;
  assert.equal(part.type, 'image/jpeg');
  assert.equal(part.size, 4);
  assert.equal(headers(requests[0].init)['Content-Type'], undefined);
  const removed = fakeFetch(() => ({ status: 200, body: { ok: true, user: { ...user, avatarUrl: null } } }));
  assert.equal((await removed.api.removeAvatar('tok')).avatarUrl, null);
  assert.equal(removed.requests[0].init.method, 'DELETE');
});
test('a refused photo says why in the server’s own words', async () => {
  const { api } = fakeFetch(() => ({ status: 422, body: { ok: false, error: 'Choose a JPEG, PNG or WebP photo under 5 MB.' } }));
  await assert.rejects(api.uploadAvatar('tok', 'data:image/png;base64,AA=='), /under 5 MB/);
});
test('devices are read from the grouped list and one is removed by its id', async () => {
  const { api, requests } = fakeFetch((_url, init) => init.method === 'DELETE'
    ? { status: 200, body: { ok: true, revoked: 2, currentRevoked: false } }
    : { status: 200, body: { ok: true, devices: [
      { id: 'd1', deviceName: 'iPhone', location: 'London', updatedAt: '2026-09-11T10:00:00Z', current: true, userAgent: 'x' },
      { id: 'd2', deviceName: '', location: '', updatedAt: null, current: false }, { bogus: true }], sessions: [] } });
  assert.deepEqual(await api.devices('tok'), [
    { id: 'd1', name: 'iPhone', location: 'London', current: true, lastActive: '2026-09-11T10:00:00Z' },
    { id: 'd2', name: 'Vibyra device', location: '', current: false, lastActive: null }]);
  assert.deepEqual(await api.revokeDevice('tok', 'd2'), { currentRevoked: false });
  assert.equal(requests[1].url, 'https://api.example.test/api/account/devices/d2');
  await api.revokeAllSessions('tok');
  assert.equal(requests[2].url, 'https://api.example.test/api/account/sessions');
  assert.equal(requests[2].init.method, 'DELETE');
});
test('password help needs no bearer and returns the server’s sentence', async () => {
  const { api, requests } = fakeFetch(url => ({ status: 200, body: { ok: true,
    message: url.endsWith('/forgot') ? 'If that email belongs to a Vibyra password account, a reset link has been sent.' : 'Sent again.' } }));
  assert.match(await api.forgotPassword('ellis@example.com'), /reset link/);
  assert.equal(await api.resendVerification('ellis@example.com'), 'Sent again.');
  assert.equal(requests[0].url, 'https://api.example.test/api/auth/password/forgot');
  assert.equal(headers(requests[0].init).Authorization, undefined);
  assert.deepEqual(JSON.parse(String(requests[1].init.body)), { email: 'ellis@example.com' });
});
test('deleting sends the proof in the body of a DELETE and passes a wrong password back', async () => {
  const { api, requests } = fakeFetch((_url, init) => JSON.parse(String(init.body)).password === 'right-one'
    ? { status: 200, body: { ok: true } } : { status: 401, body: { ok: false, error: 'Password is incorrect.' } });
  await assert.rejects(api.deleteWithPassword('tok', 'wrong'), (error: unknown) => error instanceof AccountError && error.status === 401);
  await api.deleteWithPassword('tok', 'right-one');
  assert.equal(requests[1].init.method, 'DELETE');
  assert.equal(requests[1].url, 'https://api.example.test/api/account');
  const apple = fakeFetch(() => ({ status: 200, body: { ok: true } }));
  await apple.api.deleteWithApple('tok', 'challenge-1', 'id-token');
  assert.deepEqual(JSON.parse(String(apple.requests[0].init.body)), { challengeId: 'challenge-1', identityToken: 'id-token' });
});
test('provider deletion starts with the bearer and purpose, checks the address, and polls to deleted', async () => {
  let polls = 0;
  const { api, requests } = fakeFetch(url => url.includes('/start')
    ? { status: 200, body: { ok: true, flowId: 'flow-1', authUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=s', expiresIn: 600 } }
    : ++polls === 1 ? { status: 200, body: { ok: true, status: 'pending' } } : { status: 200, body: { ok: true, status: 'complete', deleted: true } });
  assert.deepEqual(await api.startDeletion('tok', 'google'), { flowId: 'flow-1', authUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=s' });
  assert.deepEqual(JSON.parse(String(requests[0].init.body)), { deviceName: 'iPhone', purpose: 'deletion' });
  assert.equal(headers(requests[0].init).Authorization, 'Bearer tok');
  assert.equal(await api.deletionStatus('google', 'flow-1'), 'pending');
  assert.equal(await api.deletionStatus('google', 'flow-1'), 'deleted');
  const phishing = fakeFetch(() => ({ status: 200, body: { ok: true, flowId: 'f', authUrl: 'https://accounts.google.com.evil.test/' } }));
  await assert.rejects(phishing.api.startDeletion('tok', 'google'), /unexpected sign-in address/);
  const failed = fakeFetch(() => ({ status: 200, body: { ok: false, status: 'failed', error: 'The provider account does not match this Vibyra account.' } }));
  await assert.rejects(failed.api.deletionStatus('google', 'f'), /does not match/);
});
test('a browser closed the moment it said "deleted" still counts, and a missing route is not a crash', async () => {
  const signal = new AbortController().signal;
  assert.equal(await finishedAnyway({ deletionStatus: async () => 'deleted' }, 'google', 'f', signal), true);
  assert.equal(await finishedAnyway({ deletionStatus: async () => 'pending' }, 'google', 'f', signal), false);
  assert.equal(await finishedAnyway({ deletionStatus: async () => { throw new Error('expired'); } }, 'google', 'f', signal), false);
  assert.equal(await finishedAnyway({ deletionStatus: async () => 'deleted' }, 'google', null, signal), false);
  const old = fakeFetch(() => ({ status: 405, body: { message: 'The DELETE method is not supported for route api/account/avatar.' } }));
  await assert.rejects(old.api.removeAvatar('tok'), /isn’t available yet/);
});
test('last-active labels read as a person would say them', () => {
  const now = Date.parse('2026-09-11T12:00:00Z');
  assert.equal(activeLabel('2026-09-11T11:58:00Z', now), 'Active now');
  assert.equal(activeLabel('2026-09-11T11:20:00Z', now), 'Active 40 minutes ago');
  assert.equal(activeLabel('2026-09-11T11:00:00Z', now), 'Active 1 hour ago');
  assert.equal(activeLabel('2026-09-10T09:00:00Z', now), 'Active yesterday');
  assert.equal(activeLabel('2026-09-07T12:00:00Z', now), 'Active 4 days ago');
  assert.equal(activeLabel('2026-08-01T12:00:00Z', now), 'Active 1 Aug');
  assert.equal(activeLabel('2025-08-01T12:00:00Z', now), 'Active 1 Aug 2025');
  assert.equal(activeLabel(null, now), null);
});
test('a GitHub-made account is deleted on its session alone: a DELETE with the bearer and no proof', async () => {
  const { api, requests } = fakeFetch(() => ({ status: 200, body: { ok: true } }));
  await api.deleteSignedIn('tok');
  assert.equal(requests[0].init.method, 'DELETE');
  assert.equal(requests[0].url, 'https://api.example.test/api/account');
  assert.equal(headers(requests[0].init).Authorization, 'Bearer tok');
  assert.equal(requests[0].init.body ?? undefined, undefined);
});
