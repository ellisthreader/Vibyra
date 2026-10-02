import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { AccountProfile } from '../accountTypes';
import { useAccountStore } from '../state/accountStore';
import { betaReceipt, dismissal, rememberBeta, type BetaReceipt } from './betaWelcomePolicy';
import { useBetaWelcomeBlockers } from './useBetaWelcomeBlockers';

const sending = new Set<string>();
async function acknowledge(receipt: BetaReceipt) {
  const key = `${receipt.scope}:${receipt.id}`;
  if (sending.has(key) || useAccountStore.getState().snapshot.profile?.welcomeKey !== receipt.scope) return;
  sending.add(key);
  try {
    await invoke('account_license_welcome', { expectedScope: receipt.scope, welcomeId: receipt.id });
    rememberBeta(receipt, 'synced');
  } catch { /* Keep the local dismissal and retry on focus, timer or profile refresh. */ }
  finally { sending.delete(key); }
}

export function useBetaWelcome(profile: AccountProfile | null, ready: boolean) {
  const [revision, setRevision] = useState(0);
  const receipt = betaReceipt(profile);
  const state = receipt ? dismissal(receipt) : undefined;
  const pending = receipt !== null && !state;
  const { blocked, priorityBlocked } = useBetaWelcomeBlockers(ready && pending);
  useEffect(() => {
    if (!betaReceipt(profile)) return;
    const retry = () => {
      setRevision(n => n + 1); // Also removes an open notice at its actual expiry.
      const current = betaReceipt(useAccountStore.getState().snapshot.profile);
      if (current && dismissal(current) === 'pending') void acknowledge(current);
    };
    retry();
    const timer = window.setInterval(retry, 30_000);
    window.addEventListener('focus', retry);
    window.addEventListener('storage', retry);
    return () => { clearInterval(timer); window.removeEventListener('focus', retry); window.removeEventListener('storage', retry); };
  }, [profile]);
  useEffect(() => {
    if (!receipt || !pending) return;
    const timer = window.setTimeout(() => setRevision(n => n + 1), Math.min(2_147_483_647, Math.max(0, Date.parse(receipt.endsAt) - Date.now())));
    return () => clearTimeout(timer);
  }, [receipt?.endsAt, pending, revision]);
  const dismiss = () => {
    if (!receipt || useAccountStore.getState().snapshot.profile?.welcomeKey !== receipt.scope) return;
    rememberBeta(receipt, 'pending');
    setRevision(n => n + 1);
    void acknowledge(receipt);
  };
  return { receipt, pending, priorityBlocked, open: ready && pending && !blocked, dismiss };
}
