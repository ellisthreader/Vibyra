import assert from 'node:assert/strict';
import test from 'node:test';
import { activeMention, applyMention, mentionedIds } from '../src/integrations/mentions';

const known = ['github', 'stripe', 'gmail'];

test('the bare @ opens the picker on everything', () => {
  // An empty query is not "no mention": it is the moment the list should appear.
  assert.deepEqual(activeMention('@', 1), { start: 0, query: '' });
  assert.deepEqual(activeMention('ping @', 6), { start: 5, query: '' });
});
test('the typed token is the query, lowercased', () => {
  assert.deepEqual(activeMention('ping @git', 9), { start: 5, query: 'git' });
  assert.deepEqual(activeMention('@GiT', 4), { start: 0, query: 'git' });
});
test('an @ only starts a mention at the start of the text or after whitespace', () => {
  assert.deepEqual(activeMention('a @git', 6), { start: 2, query: 'git' });
  assert.equal(activeMention('a@git', 5), null, 'an @ glued to a word belongs to that word');
  assert.deepEqual(activeMention('line\n@git', 9), { start: 5, query: 'git' }, 'a newline is whitespace');
});
test('anything but a letter or digit ends the token', () => {
  assert.equal(activeMention('@git-hub', 8), null);
  assert.equal(activeMention('@github done', 12), null, 'the caret has left the token');
  assert.equal(activeMention('no mention here', 15), null);
});
test('the caret can sit inside text that is already written', () => {
  // Editing back into a finished mention re-opens it on the part before the caret.
  assert.deepEqual(activeMention('@github and more', 3), { start: 0, query: 'gi' });
  assert.deepEqual(activeMention('@git hub', 4), { start: 0, query: 'git' });
});
test('picking an integration completes the token and leaves the caret past the space', () => {
  const typed = 'ping @gi';
  const mention = activeMention(typed, typed.length);
  assert.ok(mention);
  const applied = applyMention(typed, mention.start, typed.length, 'github');
  assert.deepEqual(applied, { text: 'ping @github ', caret: 13 });
  // Round trip: the caret now follows a space, so no mention is being typed, and
  // the finished text addresses the integration that was picked.
  assert.equal(activeMention(applied.text, applied.caret), null);
  assert.deepEqual(mentionedIds(applied.text, known), ['github']);
});
test('completing a mention keeps the text on both sides of it', () => {
  assert.deepEqual(applyMention('hi @gi!', 3, 6, 'gmail'), { text: 'hi @gmail !', caret: 10 });
  assert.deepEqual(applyMention('@', 0, 1, 'stripe'), { text: '@stripe ', caret: 8 });
});
test('mentioned ids come back in the order the text uses them', () => {
  assert.deepEqual(mentionedIds('@stripe then @github', known), ['stripe', 'github']);
  assert.deepEqual(mentionedIds('@gmail @github @stripe', known), ['gmail', 'github', 'stripe']);
});
test('an integration named twice is still addressed once', () => {
  assert.deepEqual(mentionedIds('@github and again @github', known), ['github']);
  assert.deepEqual(mentionedIds('@GITHUB @github', known), ['github'], 'case is not a second mention');
});
test('matching is case-insensitive and answers in the known spelling', () => {
  assert.deepEqual(mentionedIds('ask @GitHub', known), ['github']);
  assert.deepEqual(mentionedIds('ask @github', ['GitHub']), ['GitHub']);
});
test('a longer word that merely starts with an id is not a mention', () => {
  assert.deepEqual(mentionedIds('stop @githubbing about it', known), []);
  assert.deepEqual(mentionedIds('@github2', known), []);
  assert.deepEqual(mentionedIds('@github, @gmail.', known), ['github', 'gmail'], 'punctuation ends a token');
});
test('an address is never read as a mention', () => {
  assert.deepEqual(mentionedIds('x@github', known), []);
  assert.deepEqual(mentionedIds('write to me@gmail.com', known), [], 'the @ follows a letter');
  assert.equal(activeMention('write to me@gmail', 17), null);
});
test('the empty cases stay empty', () => {
  assert.equal(activeMention('', 0), null);
  assert.equal(activeMention('@github', 0), null, 'the caret is before the @');
  assert.deepEqual(mentionedIds('', known), []);
  assert.deepEqual(mentionedIds('nothing to see', known), []);
  assert.deepEqual(mentionedIds('@github', []), [], 'no integration is connected');
});

test('completing a mention before existing text does not double the space', () => {
  assert.deepEqual(applyMention('hi @gi there', 3, 6, 'gmail'), { text: 'hi @gmail there', caret: 9 });
  assert.deepEqual(applyMention('hi @gi', 3, 6, 'gmail'), { text: 'hi @gmail ', caret: 10 });
});
