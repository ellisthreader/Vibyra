import assert from 'node:assert/strict';
import test from 'node:test';
import { openPhoneChat } from '../src/vibes/openPhoneChat';
import { VibesStore } from '../src/vibes/VibesStore';
import { sampleVibesApi, sampleWallet } from '../src/demo/sampleVibes';

function fixture() {
  const api = { ...sampleVibesApi, createChat: async () => { throw new Error('Must not create a chat yet'); },
    submit: async () => { throw new Error('Must not send any conversation data'); } };
  const store = new VibesStore(api, () => 'fixture', { read: async () => '', write: async () => {} });
  store.update({ wallet: { ...sampleWallet, paidAvailable: 10 }, selected: 'old-phone-chat', chats: [
    { id: 'old-phone-chat', title: 'Keep this history', trial_slot: null, trial_used: 0 },
  ] });
  return store;
}
test('company selection prepares an empty phone chat without sending or deleting history', async () => {
  const store = fixture(); let opened = false;
  await openPhoneChat(store, 'anthropic/claude-sonnet-5', () => { opened = true; });
  assert.equal(opened, true); assert.equal(store.state.selected, null);
  assert.equal(store.state.model, 'anthropic/claude-sonnet-5');
  assert.equal(store.state.chats[0].id, 'old-phone-chat');
});
test('a pending phone turn, stale catalogue choice and membership lock do not navigate', async () => {
  const store = fixture(); const open = () => assert.fail('Must stay in the computer conversation');
  store.update({ pending: 'in-progress' });
  await assert.rejects(openPhoneChat(store, 'auto', open), /reply to finish/);
  store.update({ pending: null });
  await assert.rejects(openPhoneChat(store, 'missing/model', open), /no longer available/);
  const paid = store.state.models.find(model => model.available && !model.trial && model.id === 'anthropic/claude-sonnet-5');
  assert.ok(paid); store.update({ wallet: sampleWallet });
  await assert.rejects(openPhoneChat(store, paid.id, open), /membership/);
  assert.equal(store.state.selected, 'old-phone-chat');
});
