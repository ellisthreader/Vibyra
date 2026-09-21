import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chatUnlocked, sendBlockReason, unverifiedNotice, type SendGate } from '../src/vibes/composerGate';
import { wallet } from './vibes.test';

/** The composer's gate: who may send, and what a tap on a grey arrow says. */
const open: SendGate = { active: true, readOnly: false, ready: true, wallet, text: 'Hello', uploading: false, failed: false,
  blind: null, referenceIssue: null, project: null, quoted: true, canAfford: true };

test('the server opening the trial to an unverified account unlocks the composer', () => {
  assert.equal(chatUnlocked({ ...wallet, verified: false, chatEnabled: true }), true);
  assert.equal(chatUnlocked({ ...wallet, verified: false, guest: false }), false, 'an older server that says nothing still asks for verification');
  assert.equal(chatUnlocked({ ...wallet, verified: false, guest: true }), true, 'a guest proved its trial at creation');
  assert.equal(chatUnlocked({ ...wallet, verified: true, chatEnabled: false }), false, 'chatEnabled false always closes it');
  assert.equal(chatUnlocked(null), false);
});
test('an unverified address is a notice, and only a lock while the trial is closed to it', () => {
  assert.match(unverifiedNotice({ ...wallet, verified: false, chatEnabled: true })!, /purchased Vibes/);
  assert.match(unverifiedNotice({ ...wallet, verified: false })!, /unlock your trial/);
  assert.equal(unverifiedNotice({ ...wallet, verified: true }), null);
  assert.equal(unverifiedNotice({ ...wallet, verified: false, guest: true }), null);
  assert.equal(sendBlockReason({ ...open, wallet: { ...wallet, verified: false, chatEnabled: true } }), null);
  assert.match(sendBlockReason({ ...open, wallet: { ...wallet, verified: false } })!, /Refresh account/);
});
test('a grey arrow always has one reason, in the order the person can act on it', () => {
  assert.equal(sendBlockReason(open), null);
  assert.match(sendBlockReason({ ...open, active: false })!, /Open this chat/);
  assert.match(sendBlockReason({ ...open, readOnly: true })!, /only reads/);
  assert.match(sendBlockReason({ ...open, wallet: null })!, /Still loading/);
  assert.match(sendBlockReason({ ...open, ready: false })!, /Still loading/);
  assert.match(sendBlockReason({ ...open, wallet: { ...wallet, chatEnabled: false } })!, /being prepared/);
  assert.match(sendBlockReason({ ...open, wallet: { ...wallet, consented: false } })!, /Allow AI processing/);
  assert.equal(sendBlockReason({ ...open, blind: 'Model cannot see photos.' }), 'Model cannot see photos.');
  assert.match(sendBlockReason({ ...open, failed: true })!, /did not upload/);
  assert.match(sendBlockReason({ ...open, uploading: true })!, /finish uploading/);
  assert.equal(sendBlockReason({ ...open, referenceIssue: 'GitHub is not connected.' }), 'GitHub is not connected.');
  assert.match(sendBlockReason({ ...open, project: 'Notes' })!, /use Notes/);
  assert.match(sendBlockReason({ ...open, text: '  ' })!, /Type a message/);
  assert.match(sendBlockReason({ ...open, quoted: false })!, /price/);
  assert.match(sendBlockReason({ ...open, canAfford: false })!, /Not enough Vibes/);
});
