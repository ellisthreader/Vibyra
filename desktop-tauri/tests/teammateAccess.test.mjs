import test from 'node:test';
import assert from 'node:assert/strict';
import { accessHint, hintCopy, mentions } from '../src/components/teammates/serviceHints.ts';
import { MAX_GRANTS, settleConnects, withGrant } from '../src/components/teammates/grantTick.ts';
import { profileFields, restoreSetup } from '../src/components/teammates/setupStorage.ts';

const item = (id, name, installed, configured = true, kind = 'oauth') => ({ id, name, installed, credential: { configured, kind } });
const catalogue = (ready = []) => [
  item('gmail', 'Gmail', ready.includes('gmail')), item('outlook_mail', 'Outlook Mail', ready.includes('outlook_mail')),
  item('google_calendar', 'Google Calendar', ready.includes('google_calendar')), item('google_drive', 'Google Drive', ready.includes('google_drive')),
  item('github', 'GitHub', ready.includes('github')), item('slack', 'Slack', ready.includes('slack'), false),
  item('hackernews', 'Hacker News', true, true, 'public'),
];

test('a connected service the teammate lacks offers Allow', () => {
  const hint = accessHint('Summarize my unread emails', [], catalogue(['gmail']));
  assert.equal(hint.kind, 'allow'); assert.equal(hint.item.id, 'gmail');
  assert.deepEqual(hintCopy.allow('Gmail'), { text: "Gmail is connected, but this teammate can't use it yet.", action: 'Allow Gmail' });
});
test('a granted service that is no longer connected offers Reconnect, an unconnected one Connect', () => {
  assert.equal(accessHint('check my inbox', ['gmail'], catalogue()).kind, 'reconnect');
  assert.equal(accessHint('what is on my calendar today', [], catalogue()).kind, 'connect');
  assert.equal(accessHint('what is on my calendar today', [], catalogue()).item.id, 'google_calendar');
});
test('a service that cannot be connected here gives no hint', () => {
  assert.equal(accessHint('post this in slack', [], catalogue()), null);
});
test('a ready service and messages about nothing give no hint', () => {
  assert.equal(accessHint('check my inbox', ['gmail'], catalogue(['gmail'])), null);
  assert.equal(accessHint('Refactor the login form', [], catalogue(['gmail'])), null);
  assert.equal(accessHint('   ', [], catalogue(['gmail'])), null);
});
test('one ready service in a family means no nag for its sibling', () => {
  // Gmail is ready; Outlook is not connected but shares the same words.
  assert.equal(accessHint('any new email in my inbox?', ['gmail'], catalogue(['gmail'])), null);
  // Naming Outlook explicitly still has a ready sibling, so it stays quiet as well.
  assert.equal(accessHint('any new email in outlook?', ['gmail'], catalogue(['gmail'])), null);
  // Not granted anywhere: the connected one is offered before the unconnected one.
  assert.equal(accessHint('any new email?', [], catalogue(['outlook_mail'])).item.id, 'outlook_mail');
});
test('with several services the first one that is not ready wins', () => {
  const hint = accessHint('email the pr link and check the calendar', ['gmail'], catalogue(['gmail', 'github']));
  assert.equal(hint.item.id, 'google_calendar'); assert.equal(hint.kind, 'connect');
  assert.equal(accessHint('open the repo then read my inbox', [], catalogue(['gmail', 'github'])).item.id, 'gmail');
});
test('a public service the teammate lacks offers Allow', () => {
  assert.equal(accessHint('top stories on hacker news', [], catalogue()).item.id, 'hackernews');
});
test('terms match whole words only, like the backend', () => {
  for (const [text, term] of [['a primer on printing', 'pr'], ['emailing', 'email'], ['profile', 'file'], ['snake_mail', 'mail'], ['mailbox', 'mail'], ['calendars2', 'calendar']])
    assert.equal(mentions(text, term), false, `${term} in "${text}"`);
  for (const [text, term] of [['Open the PR.', 'pr'], ['my e-mails? no: emails', 'email'], ['read the Docs', 'doc'], ['to-do list', 'to-do'], ['Hacker News today', 'hacker news']])
    assert.equal(mentions(text, term), true, `${term} in "${text}"`);
  assert.equal(accessHint('a primer on printing', [], catalogue(['github'])), null);
});

test('connecting from Access ticks only the service just connected', () => {
  // Gmail was already connected and is not waiting; Google Calendar was connected here.
  const next = settleConnects(['google_calendar'], ['gmail', 'google_calendar'], []);
  assert.deepEqual(next, { tick: ['google_calendar'], waiting: [] });
  assert.deepEqual(['google_calendar'].reduce(withGrant, ['github']), ['github', 'google_calendar']);
});
test('a sign-in still open stays waiting; one that ended without installing is forgotten', () => {
  assert.deepEqual(settleConnects(['slack'], ['gmail'], ['slack']), { tick: [], waiting: ['slack'] });
  assert.deepEqual(settleConnects(['slack'], ['gmail'], []), { tick: [], waiting: [] });
});
test('a grant is never duplicated or added past the cap', () => {
  const selected = ['gmail']; assert.equal(withGrant(selected, 'gmail'), selected);
  const full = Array.from({ length: MAX_GRANTS }, (_, i) => `s${i}`); assert.equal(withGrant(full, 'gmail'), full);
});

const agent = { id: 'a1', revision: 5, name: 'Ada', brief: 'Help', memory: '', avatar: 'sprout', budget: 10, integrations: ['gmail'], model: 'auto', skillIds: [] };
const draft = (revision, integrations, extra = {}) => JSON.stringify({ fields: { ...profileFields(agent), name: 'Ada (draft)', integrations }, revision, pending: null, ...extra });
test('a draft older than the saved teammate never overrides its grants', () => {
  const result = restoreSetup(draft(4, []), agent);
  assert.deepEqual(result.fields.integrations, ['gmail']);
  assert.equal(result.fields.name, 'Ada (draft)', 'the person’s other edits are kept');
  assert.equal(result.revision, 4, 'saving it is still refused rather than overwriting the newer save');
});
test('a draft on the current revision keeps its own edits, and a pending save stays exact', () => {
  assert.deepEqual(restoreSetup(draft(5, ['gmail', 'github']), agent).fields.integrations, ['gmail', 'github']);
  const body = { ...profileFields(agent), integrations: [], revision: 4 };
  const pending = restoreSetup(draft(4, [], { pending: body }), agent);
  assert.deepEqual(pending.pending, body); assert.deepEqual(pending.fields.integrations, []);
});
