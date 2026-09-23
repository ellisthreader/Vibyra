import test from 'node:test';
import assert from 'node:assert/strict';
import { previewNavigationAllowed } from '../src/preview/navigation';

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
