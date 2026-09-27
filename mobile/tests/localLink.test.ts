import test from 'node:test';
import assert from 'node:assert/strict';
import { macLocalUrl } from '../src/conversation/localLink';

test('only sites on the Mac itself count as local', () => {
  for (const url of ['http://127.0.0.1:8000/menu', 'http://localhost:5173', 'http://[::1]:3000/', 'http://0.0.0.0:8080'])
    assert.equal(macLocalUrl(url), true, url);
  for (const url of ['https://vibyra.app', 'http://127.0.0.1.evil.com/', 'http://192.168.1.4:3000'])
    assert.equal(macLocalUrl(url), false, url);
});
