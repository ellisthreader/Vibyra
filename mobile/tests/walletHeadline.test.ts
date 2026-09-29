import assert from 'node:assert/strict';
import test from 'node:test';
import { walletHeadline } from '../src/vibes/walletHeadline';
import { wallet } from './vibes.test';

/**
 * The figure Settings > Vibyra tokens leads with. The backend funds the trial as a
 * chat starts, so a fresh free account can hold nothing while its meters still say
 * "60 of 60"; the headline must not then contradict them with "0 Vibes available".
 */
test('a balance leads as itself', () => {
  assert.deepEqual(walletHeadline({ ...wallet, available: 3 }), { figure: 3, unit: 'Vibes available', label: '3 Vibes available' });
  assert.equal(walletHeadline({ ...wallet, available: 1240, total: 1240, paidAvailable: 1240 }).label, '1,240 Vibes available');
});

test('an empty wallet with its whole trial ahead leads with the trial allowance, as an offer', () => {
  const fresh = { ...wallet, available: 0, total: 0, trialCredits: 3, trialChats: 2, trialChatsRemaining: 2 };
  assert.deepEqual(walletHeadline(fresh), { figure: 3, unit: 'Vibes to try', label: '3 Vibes to try' });
});

test('once a trial chat has drawn on it, or anything is held or paid, the balance is the only truthful figure', () => {
  const base = { ...wallet, available: 0, total: 0, trialCredits: 3, trialChats: 2 };
  assert.equal(walletHeadline({ ...base, trialChatsRemaining: 1 }).label, '0 Vibes available');
  assert.equal(walletHeadline({ ...base, trialChatsRemaining: 2, held: 1, total: 1 }).label, '0 Vibes available');
  assert.equal(walletHeadline({ ...base, trialChatsRemaining: 2, paidAvailable: 0, available: 5, total: 5 }).label, '5 Vibes available');
});

test('a backend that publishes no trial figures never has an allowance invented for it', () => {
  const older = { ...wallet, available: 0, total: 0, trialChatsRemaining: 2, trialCredits: null, trialChats: null, trialChatCredits: null };
  assert.equal(walletHeadline(older).label, '0 Vibes available');
  assert.equal(walletHeadline({ ...older, trialCredits: 0, trialChats: 2 }).label, '0 Vibes available');
});
