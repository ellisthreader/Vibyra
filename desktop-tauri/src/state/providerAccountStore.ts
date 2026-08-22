import { create } from "zustand";

import {
  addProviderAccount,
  cancelProviderAccount,
  connectProviderAccount,
  disconnectProviderAccount,
  installProviderCli,
  listProviderAccounts,
  openProviderSignInPage,
  removeProviderAccount,
  submitProviderAccountInput,
} from "../ipc/providerAccounts";
import type { ProviderIntegration } from "../providerTypes";

/**
 * Which row is busy, as `provider:account`.
 *
 * A single provider id is no longer enough: signing one ChatGPT account in
 * must not grey out the other one's buttons.
 */
export function busyKey(provider: string, account: string): string {
  return `${provider}:${account}`;
}

interface ProviderAccountStore {
  providers: ProviderIntegration[];
  busyKey: string | null;
  error: string;
  loaded: boolean;
  refresh: () => Promise<void>;
  connect: (provider: string, account: string) => Promise<void>;
  addAccount: (provider: string) => Promise<void>;
  removeAccount: (provider: string, account: string) => Promise<void>;
  install: (provider: string) => Promise<void>;
  /** Answers whatever the provider CLI is currently asking for. */
  submit: (provider: string, account: string, value: string) => Promise<void>;
  cancel: (provider: string, account: string) => Promise<void>;
  disconnect: (provider: string, account: string) => Promise<void>;
  openSignInPage: (provider: string, account: string) => Promise<void>;
}

async function runAction(
  set: (partial: Partial<ProviderAccountStore>) => void,
  key: string,
  action: () => Promise<ProviderIntegration[]>,
) {
  set({ busyKey: key, error: "" });
  try {
    set({ providers: await action(), loaded: true });
  } catch (error) {
    set({ error: String(error) });
  } finally {
    set({ busyKey: null });
  }
}

export const useProviderAccountStore = create<ProviderAccountStore>((set) => ({
  providers: [],
  busyKey: null,
  error: "",
  loaded: false,

  refresh: async () => {
    try {
      set({ providers: await listProviderAccounts(), error: "", loaded: true });
    } catch (error) {
      set({ error: String(error), loaded: true });
    }
  },

  connect: (provider, account) =>
    runAction(set, busyKey(provider, account), () => connectProviderAccount(provider, account)),
  addAccount: (provider) =>
    runAction(set, busyKey(provider, "new"), () => addProviderAccount(provider)),
  removeAccount: (provider, account) =>
    runAction(set, busyKey(provider, account), () => removeProviderAccount(provider, account)),
  install: (provider) =>
    runAction(set, busyKey(provider, "install"), () => installProviderCli(provider)),
  submit: (provider, account, value) =>
    runAction(set, busyKey(provider, account), () =>
      submitProviderAccountInput(provider, account, value),
    ),
  cancel: (provider, account) =>
    runAction(set, busyKey(provider, account), () => cancelProviderAccount(provider, account)),
  disconnect: (provider, account) =>
    runAction(set, busyKey(provider, account), () => disconnectProviderAccount(provider, account)),
  openSignInPage: async (provider, account) => {
    try {
      await openProviderSignInPage(provider, account);
    } catch (error) {
      set({ error: String(error) });
    }
  },
}));
