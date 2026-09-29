import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allowAfterConnect } from '../src/agents/setup/allowAfterConnect';

test('a service connected from setup becomes allowed for the teammate', () => {
  assert.deepEqual(allowAfterConnect(['github'], ['gmail'], ['github', 'gmail'], true), ['github', 'gmail']);
});

test('a connect that failed, was cancelled, or never installed grants nothing', () => {
  const selected = ['github'];
  assert.equal(allowAfterConnect(selected, [], ['github'], true), selected);
  assert.equal(allowAfterConnect(selected, ['gmail'], ['github'], true), selected, 'not installed after the flow');
});

test('services already allowed are not duplicated and others are left alone', () => {
  const selected = ['gmail', 'github'];
  assert.equal(allowAfterConnect(selected, ['gmail', 'gmail'], ['gmail', 'github', 'slack'], true), selected);
  assert.deepEqual(allowAfterConnect(['github'], ['gmail', 'gmail'], ['gmail', 'slack'], true), ['github', 'gmail']);
});

test('nothing is ticked while connections are unavailable or the form is locked', () => {
  const selected: string[] = [];
  assert.equal(allowAfterConnect(selected, ['gmail'], ['gmail'], false), selected);
});
