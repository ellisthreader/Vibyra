import test from 'node:test';
import assert from 'node:assert/strict';
import { createIntegrationsApi, IntegrationsError } from '../src/integrations/api';

const catalogue = { enabled: true, integrations: [{ id: 'github' }, { id: 'stripe' }] };
function fakeFetch(handler: (url: string) => { status: number; body?: string } | Error) {
  const impl = (async (input: string | URL | Request) => {
    const result = handler(String(input));
    if (result instanceof Error) throw result;
    return new Response(result.body ?? '', { status: result.status });
  }) as typeof fetch;
  return createIntegrationsApi('https://api.example.test/', () => 'tok-1', impl);
}
const failure = async (run: () => Promise<unknown>): Promise<IntegrationsError> => {
  try { await run(); } catch (error) { return error as IntegrationsError; }
  throw new Error('expected a failure');
};

test('the catalogue is read from the integrations endpoint and kept to its shape', async () => {
  const api = fakeFetch(url => url === 'https://api.example.test/api/connectors'
    ? { status: 200, body: JSON.stringify({ ...catalogue, integrations: [...catalogue.integrations, { name: 'no id' }] }) }
    : new Error('wrong url: ' + url));
  assert.deepEqual(await api.catalogue(), { enabled: true, integrations: [{ id: 'github' }, { id: 'stripe' }] });
});

/*
 * A deployment whose backend predates integrations answers the catalogue in framework
 * language, and Laravel puts it in the same `message` field our own refusals use,
 * so it was printed on the page: "The GET method is not supported for route
 * api/connectors. Supported methods: OPTIONS." Routing is never something to say to
 * a person, and the honest sentence is that this server has no integrations yet.
 */
test('a server without the endpoint says so, in words, and never quotes its router', async () => {
  for (const status of [404, 405, 501]) {
    const api = fakeFetch(() => ({ status, body: JSON.stringify({ message: 'The GET method is not supported for route api/connectors. Supported methods: OPTIONS.' }) }));
    const error = await failure(() => api.catalogue());
    assert.equal(error.message, 'Integrations are not available on this server yet.');
    assert.equal(error.status, status);
  }
});

test('a refusal the backend wrote for a person is passed through untouched', async () => {
  const api = fakeFetch(() => ({ status: 422, body: JSON.stringify({ error: 'That token did not work. Check it has not expired and try again.' }) }));
  const error = await failure(() => api.connect('github', 'nonsense'));
  assert.equal(error.message, 'That token did not work. Check it has not expired and try again.');
  assert.equal(error.status, 422);
});

/*
 * A proxy error page and a gateway timeout are HTML, and parsing before the status
 * was read threw, so both were reported as `status: 0` - the code that means the
 * phone never heard back at all - and a server that is up but unwell looked like
 * a phone with no signal.
 */
test('a body that is not JSON is still read as the status the server sent', async () => {
  const api = fakeFetch(() => ({ status: 502, body: '<html><body>Bad gateway</body></html>' }));
  const error = await failure(() => api.catalogue());
  assert.equal(error.message, 'Vibyra could not answer just now. Please try again.');
  assert.equal(error.status, 502);
});

test('a phone with no signal is the one case that says so', async () => {
  const api = fakeFetch(() => new Error('Network request failed'));
  const error = await failure(() => api.catalogue());
  assert.equal(error.message, 'Could not reach Vibyra. Check your connection and try again.');
  assert.equal(error.status, 0);
});

test('a 200 that is not a catalogue is refused rather than drawn as an empty shop', async () => {
  const api = fakeFetch(() => ({ status: 200, body: JSON.stringify({ enabled: true }) }));
  const error = await failure(() => api.catalogue());
  assert.equal(error.message, 'Integrations are temporarily unavailable.');
});

test('a sign-in is started with the app\'s return link, and its outcome is read back as a catalogue', async () => {
  const seen: { url: string; body?: string }[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(input), body: init?.body as string | undefined });
    if (String(input).endsWith('/start')) return new Response(JSON.stringify({ flowId: 'f-1', url: 'https://github.com/login/oauth/authorize?x=1' }), { status: 200 });
    return new Response(JSON.stringify({ status: 'connected', catalogue }), { status: 200 });
  }) as typeof fetch;
  const api = createIntegrationsApi('https://api.example.test', () => 'tok-1', impl);
  const flow = await api.start!('github', 'vibyra://integrations/connected');
  assert.deepEqual(flow, { flowId: 'f-1', url: 'https://github.com/login/oauth/authorize?x=1' });
  assert.equal(seen[0].url, 'https://api.example.test/api/connectors/github/start');
  assert.deepEqual(JSON.parse(seen[0].body!), { returnUrl: 'vibyra://integrations/connected' });
  const state = await api.flow!('f-1');
  assert.equal(seen[1].url, 'https://api.example.test/api/connectors/flows/f-1');
  assert.equal(state.status, 'connected');
  assert.deepEqual(state.catalogue, { enabled: true, integrations: [{ id: 'github' }, { id: 'stripe' }] });
});

test('guest OAuth uses the same bearer and never adopts a Vibyra login', async () => {
  let guest: string | null = null;
  const seen: (string | undefined)[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    seen.push((init?.headers as Record<string, string>)?.Authorization);
    const body = String(input).endsWith('/start') ? { flowId: 'f-2', url: 'https://github.com/login/oauth/authorize' }
      : { status: 'connected', catalogue, session: { token: 'unexpected', user: { email: 'different@example.com' } } };
    return new Response(JSON.stringify(body));
  }) as typeof fetch;
  const api = createIntegrationsApi('https://api.example.test', async prepare => {
    if (prepare && !guest) guest = 'guest-token';
    return guest;
  }, impl);
  await api.start!('github', 'vibyra://integrations/connected');
  const result = await api.flow!('f-2');
  assert.deepEqual(seen, ['Bearer guest-token', 'Bearer guest-token']);
  assert.equal('session' in result, false);
  assert.equal(result.status, 'connected');
});

test('a changed session cannot receive an in-flight catalogue or connect result', async () => {
  for (const operation of ['start', 'flow'] as const) {
    let token = 'guest';
    const api = createIntegrationsApi('https://api.example.test', () => token, (async () => {
      token = 'another-account';
      return new Response(JSON.stringify(catalogue));
    }) as typeof fetch);
    await assert.rejects(() => operation === 'start' ? api.start!('github', 'vibyra://integrations/connected') : api.flow!('flow'), /account changed/);
  }
});

test('a failed guest bootstrap never sends an anonymous connect request', async () => {
  let called = false;
  const api = createIntegrationsApi('https://api.example.test', async () => null, (async () => {
    called = true; return new Response('{}');
  }) as typeof fetch);
  await assert.rejects(() => api.start!('stripe', 'vibyra://integrations/connected'), /guest session/);
  assert.equal(called, false);
});

test('an older server rejecting guests never asks them to create a Vibyra account', async () => {
  const api = fakeFetch(() => ({ status: 403, body: JSON.stringify({ error: 'Create your free account to use this.' }) }));
  const error = await failure(() => api.start!('github', 'vibyra://integrations/connected'));
  assert.equal(error.status, 403);
  assert.equal(error.message, 'Connecting is temporarily unavailable. Please try again later.');
});

test('legacy provider setup errors do not expose server configuration instructions', async () => {
  for (const message of ['Signing in to GitHub is not set up on this server yet.', 'GitHub sign-in is not available right now. Please try again later.']) {
    const api = fakeFetch(() => ({ status: 422, body: JSON.stringify({ message }) }));
    const error = await failure(() => api.start!('github', 'vibyra://integrations/connected'));
    assert.equal(error.status, 422);
    assert.equal(error.message, 'Could not connect. Please try again later.');
  }
});

test('legacy OAuth account gating never redirects guests to Vibyra sign-in', async () => {
  const api = fakeFetch(() => ({ status: 401, body: JSON.stringify({ message: 'Sign in to Vibyra to connect GitHub.' }) }));
  const error = await failure(() => api.start!('github', 'vibyra://integrations/connected'));
  assert.equal(error.status, 401);
  assert.equal(error.message, 'Connecting is temporarily unavailable. Please try again later.');
});

test('the initial public catalogue retries if guest bootstrap completes while it is loading', async () => {
  let token: string | null = null; const seen: (string | undefined)[] = [];
  const api = createIntegrationsApi('https://api.example.test', () => token, (async (_input, init) => {
    seen.push((init?.headers as Record<string, string>).Authorization);
    token = 'guest'; return new Response(JSON.stringify(catalogue));
  }) as typeof fetch);
  assert.deepEqual(await api.catalogue(), catalogue);
  assert.deepEqual(seen, [undefined, 'Bearer guest']);
});
