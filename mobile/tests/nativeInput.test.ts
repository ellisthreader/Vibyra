import test from 'node:test';
import assert from 'node:assert/strict';
import { INPUT_ANCHOR as a, nativeInputDelta as delta } from '../src/terminal/nativeInput';

test('native terminal editing sends additions, backspace and return exactly once', () => {
  assert.equal(delta(a, a + 'hello'), 'hello');
  assert.equal(delta(a + 'hello', a + 'hell'), '\x7f');
  assert.equal(delta(a, ''), '\x7f');
  assert.equal(delta(a + 'hello', a + 'hello\n'), '\r');
  assert.equal(delta(a + 'hello', a + 'hello'), '');
});

test('native terminal input preserves Unicode and translates replacement and paste', () => {
  assert.equal(delta(a, a + '日本語 👋'), '日本語 👋');
  assert.equal(delta(a + '👋', a), '\x7f');
  assert.equal(delta(a + 'に', a + '日本'), '\x7f日本');
  assert.equal(delta(a, a + 'printf “hello”\n'), 'printf "hello"\r');
  assert.equal(delta(a + '--', a + '—'), '');
  assert.equal(delta(a + '—', a), '\x7f\x7f');
});
