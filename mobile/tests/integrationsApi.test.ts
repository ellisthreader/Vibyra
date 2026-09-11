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
  const api = fakeFetch(url => url === 'https://api.example.test/api/integrations'
    ? { status: 200, body: JSON.stringify({ ...catalogue, integrations: [...catalogue.integrations, { name: 'no id' }] }) }
    : new Error('wrong url: ' + url));
  assert.deepEqual(await api.catalogue(), { enabled: true, integrations: [{ id: 'github' }, { id: 'stripe' }] });
});

/*
 * A deployment whose backend predates integrations answers the catalogue in framework
 * language, and Laravel puts it in the same `message` field our own refusals use,
 * so it was printed on the page: "The GET method is not supported for route
 * api/integrations. Supported methods: OPTIONS." Routing is never something to say to
 * a person, and the honest sentence is that this server has no integrations yet.
 */
test('a server without the endpoint says so, in words, and never quotes its router', async () => {
  for (const status of [404, 405, 501]) {
    const api = fakeFetch(() => ({ status, body: JSON.stringify({ message: 'The GET method is not supported for route api/integrations. Supported methods: OPTIONS.' }) }));
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
