import assert from 'node:assert/strict';
import { test } from 'node:test';
import { composerInput } from '../src/terminal/composerInput';

test('multiline composer text uses the active terminal paste framing once', () => {
  assert.equal(composerInput('first\r\nsecond\nthird', true), '\x1b[200~first\rsecond\rthird\x1b[201~\r');
});
test('a phone keyboard\'s smart punctuation reaches the terminal as what was typed', () => {
  assert.equal(composerInput('git commit -m “don’t” --amend —help', false), 'git commit -m "don\'t" --amend --help\r');
  assert.equal(composerInput('echo ‘hi’', true), '\x1b[200~echo \'hi\'\x1b[201~\r');
});
test('unsupported multiline paste rejects instead of submitting separate lines', () => {
  assert.throws(() => composerInput('first\nsecond', false), /one line at a time/);
  assert.equal(composerInput('single line', false), 'single line\r');
});
