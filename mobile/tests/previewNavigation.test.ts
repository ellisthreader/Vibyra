import test from 'node:test';
import assert from 'node:assert/strict';
import { previewFrameAllowed, previewLocation, previewNavigationAllowed } from '../src/preview/navigation';

test('Preview browser navigation stays on its exact loopback origin', () => {
  const start = 'http://127.0.0.1:43111/_vibyra_preview/token';
  assert.equal(previewNavigationAllowed(start, 'http://127.0.0.1:43111/'), true);
  assert.equal(previewNavigationAllowed(start, 'http://127.0.0.1:43111/page?item=1'), true);
  for (const url of [
    'http://127.0.0.1:43112/', 'http://localhost:43111/',
    'http://169.254.169.254/', 'https://example.com/',
    'file:///etc/passwd', 'javascript:alert(1)', 'vibyra://pair',
  ]) assert.equal(previewNavigationAllowed(start, url), false, url);
});

test('the address strip never exposes the one-time native bootstrap token', () => {
  assert.equal(previewLocation('http://127.0.0.1:43111/_vibyra_preview/secret?start=/menu'), null);
  assert.equal(previewLocation('http://127.0.0.1:43111/menu?tag=soy'), '/menu?tag=soy');
  assert.equal(previewLocation('invalid'), null);
});

test("a site's own embedded frames load, without reaching the phone's loopback or other apps", () => {
  const start = 'http://127.0.0.1:43111/_vibyra_preview/token';
  for (const url of [
    'https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b/turnstile/if/ov2/',
    'https://js.stripe.com/v3/elements-inner.html', 'about:srcdoc', 'about:blank',
    'http://127.0.0.1:43111/embed', 'data:text/html,hi',
  ]) assert.equal(previewFrameAllowed(start, url), true, url);
  for (const url of [
    'http://127.0.0.1:43112/', 'http://localhost:8081/', 'http://[::1]:4319/',
    'file:///etc/passwd', 'javascript:alert(1)', 'vibyra://pair', 'tel:123',
    'https://user:pw@example.com/',
  ]) assert.equal(previewFrameAllowed(start, url), false, url);
});
