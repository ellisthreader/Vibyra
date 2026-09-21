import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authorizeInBrowser, CANCELLED } from '../src/integrations/authorizeInBrowser.web';
import type { IntegrationsApi } from '../src/integrations/types';

const catalogue = { enabled: true, integrations: [] };
function setup() {
  const popup = { opener: {} as unknown, closed: false, location: { href: '' }, close() { this.closed = true; } };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { open: () => popup } });
  const api: IntegrationsApi = {
    catalogue: async () => catalogue, connect: async () => catalogue, disconnect: async () => catalogue,
    start: async (_id, returnUrl) => { assert.equal(returnUrl, ''); return { flowId: 'flow', url: 'https://www.figma.com/oauth' }; },
    flow: async id => { assert.equal(id, 'flow'); return { status: 'connected', catalogue }; },
  };
  return { api, popup };
}
test('web OAuth relies on the authenticated flow, removes opener and closes the popup', async () => {
  const { api, popup } = setup();
  assert.deepEqual(await authorizeInBrowser(api, 'figma'), { catalogue });
  assert.equal(popup.opener, null); assert.equal(popup.closed, true);
  assert.equal(popup.location.href, 'https://www.figma.com/oauth');
});
test('cancelling during start never navigates the popup', async () => {
  const { api, popup } = setup(); const control = new AbortController();
  api.start = async () => { control.abort(); return { flowId: 'flow', url: 'https://www.figma.com/oauth' }; };
  api.flow = async () => { throw new Error('must not poll'); };
  await assert.rejects(authorizeInBrowser(api, 'figma', control.signal), { message: CANCELLED });
  assert.equal(popup.closed, true); assert.equal(popup.location.href, '');
});
test('provider rejection closes the popup and never reports a connection', async () => {
  const { api, popup } = setup();
  api.flow = async () => ({ status: 'failed', error: 'Access declined', catalogue });
  await assert.rejects(authorizeInBrowser(api, 'figma'), /Access declined/);
  assert.equal(popup.closed, true);
});
