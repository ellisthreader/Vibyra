import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePreviewUrl, previewRecovery } from '../src/lib/previewUrl.ts';
test('manual preview accepts local and hosted URLs, retaining routes and queries', () => {
  assert.equal(normalizePreviewUrl(' localhost:3000/app?q=1 '), 'http://localhost:3000/app?q=1');
  assert.equal(normalizePreviewUrl('127.0.0.1:5173'), 'http://127.0.0.1:5173/');
  assert.equal(normalizePreviewUrl('[::1]:3000'), 'http://[::1]:3000/');
  assert.equal(normalizePreviewUrl('example.com/demo'), 'http://example.com/demo');
  assert.equal(normalizePreviewUrl('http://192.168.1.4:8080'), 'http://192.168.1.4:8080/');
});
test('manual preview rejects executable schemes, credentials and the app itself', () => {
  for (const input of ['', 'javascript:alert(1)', 'data:text/html,hi', 'file:///etc/passwd', 'ftp://site.com', 'https://user:pass@site.com', 'https://tauri.localhost', 'not a url']) {
    assert.throws(() => normalizePreviewUrl(input), undefined, input);
  }
  assert.throws(() => normalizePreviewUrl('http://localhost:1420', 'http://localhost:1420'));
});
test('recovery uses startup output instead of a generic exit code alone', () => {
  assert.match(previewRecovery('exited with 1', ['sh: vite: command not found']), /dependencies/);
  assert.match(previewRecovery('failed', ['EADDRINUSE']), /already using/);
  assert.match(previewRecovery('within 75 seconds', []), /too long/);
});

test('scheme-less development addresses use HTTP; explicit schemes survive replacement', () => {
  for (const host of ['192.168.1.4', '10.0.0.2', '172.16.0.5', 'dev-machine.local', 'devbox', '[fd00::1]', 'example.com']) {
    assert.equal(normalizePreviewUrl(`${host}:8080/app?q=1#section`), `http://${host}:8080/app?q=1#section`);
    assert.equal(normalizePreviewUrl(`https://${host}:8443/app`), `https://${host}:8443/app`);
    assert.equal(normalizePreviewUrl(`http://${host}:8080/app`), `http://${host}:8080/app`);
  }
});
