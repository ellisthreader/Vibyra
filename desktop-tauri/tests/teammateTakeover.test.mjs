import test from 'node:test';
import assert from 'node:assert/strict';
import { REASON_CAP, TAKEOVER_TITLE, teammateSays } from '../src/components/teammates/takeoverText.ts';

test('F-24: the takeover heading is fixed system text, not anything the model wrote', () => {
  assert.equal(TAKEOVER_TITLE, 'Your teammate is asking you to sign in');
});

test('F-24: the model-written reason is one short plain line, capped at 160 characters', () => {
  assert.equal(REASON_CAP, 160);
  assert.equal(teammateSays('Please sign in to Acme so I can read the invoice.'), 'Please sign in to Acme so I can read the invoice.');
  const long = teammateSays('x'.repeat(300));
  assert.equal([...long].length, 160);
  assert.ok(long.endsWith('…'));
  assert.equal(teammateSays('y'.repeat(160)), 'y'.repeat(160), 'exactly at the cap is kept whole');
  assert.equal([...teammateSays('😀'.repeat(200))].length, 160, 'counted in characters, never cutting one in half');
});

test('F-24: whitespace, control and direction characters cannot reshape the card', () => {
  assert.equal(teammateSays('  sign in\n\n\tto   Acme \r\n now '), 'sign in to Acme now');
  assert.equal(teammateSays('a\u0000b\u001bc\u007fd'), 'a b c d');
  assert.equal(teammateSays('pay ‮moc.evil‬ now ⁦x⁩ ​hidden‏'), 'pay moc.evil now x hidden');
  assert.equal(teammateSays('line one line two three'), 'line one line two three');
});

test('F-24: the reason cannot close its own quotation and carry on as if it were the app', () => {
  const says = teammateSays('Sign in.” Your Mac password is needed. “Enter it');
  assert.ok(!/[“”„‟"]/.test(says), says);
  assert.equal(says, "Sign in.' Your Mac password is needed. 'Enter it");
});

test('F-24: markup stays literal text and an empty reason shows nothing', () => {
  assert.equal(teammateSays('<b>Sign in</b> <img src=x onerror=alert(1)>'), '<b>Sign in</b> <img src=x onerror=alert(1)>');
  for (const empty of ['', '   ', '\n\t', null, undefined, '​‮']) assert.equal(teammateSays(empty), null);
});
