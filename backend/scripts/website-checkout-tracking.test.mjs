import test from 'node:test';
import assert from 'node:assert/strict';

test('checkout browser telemetry sends only consented allowlisted events', async () => {
  const sent = [];
  globalThis.location = { pathname: '/checkout', search: '' };
  globalThis.document = { referrer: '', querySelector: () => ({ content: 'csrf-fixture' }) };
  globalThis.fetch = async (_url, options) => { sent.push(JSON.parse(options.body)); return {}; };
  const tracker = await import('../resources/js/websiteTracking.js');
  tracker.trackCurrentPage();
  assert.equal(sent.length, 0);
  tracker.setWebsiteTrackingChoice('aggregate');
  tracker.trackCurrentPage();
  for (const cta of ['checkout_signup', 'checkout_login', 'checkout_pay']) {
    assert.equal(tracker.trackWebsiteEvent('website_cta_clicked', cta), true);
  }
  assert.deepEqual(sent.map(event => event.dimension), ['/checkout', 'checkout_signup', 'checkout_login', 'checkout_pay']);
  assert.equal(tracker.trackWebsiteEvent('website_cta_clicked', 'private-email'), false);
  tracker.setWebsiteTrackingChoice('declined');
  tracker.trackCurrentPage();
  assert.equal(sent.length, 4);
});
