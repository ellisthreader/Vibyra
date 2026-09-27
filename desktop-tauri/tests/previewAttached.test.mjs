import test from 'node:test';
import assert from 'node:assert/strict';
import { attachedPreviewPort } from '../src/lib/previewAttached.ts';

test('only exact local HTTP ports can be offered to a phone', () => {
  assert.equal(attachedPreviewPort('http://127.0.0.1:8001/menu'), 8001);
  for (const address of ['https://127.0.0.1:8001/', 'http://localhost:8001/',
    'http://192.168.1.20:8001/', 'http://127.0.0.1/',
    'http://user@127.0.0.1:8001/', 'http://127.0.0.1:8001/#fragment',
    'https://example.com/']) {
    assert.equal(attachedPreviewPort(address), null, address);
  }
});
