import { create } from "zustand";

import {
  cancelProviderAccount,
  connectProviderAccount,
  disconnectProviderAccount,
  listProviderAccounts,
  openProviderSignInPage,
} from "../ipc/providerAccounts";
import type { ProviderAccount } from "../types";

interface ProviderAccountStore {
  accounts: ProviderAccount[];
  busyId: string | null;
  error: string;
  loaded: boolean;
  refresh: () => Promise<void>;
  connect: (provider: string) => Promise<void>;
  cancel: (provider: string) => Promise<void>;
  disconnect: (provider: string) => Promise<void>;
  openSignInPage: (provider: string) => Promise<void>;
}

async function runAction(
  set: (partial: Partial<ProviderAccountStore>) => void,
  provider: string,
  action: (provider: string) => Promise<ProviderAccount[]>,
) {
  set({ busyId: provider, error: "" });
  try {
    set({ accounts: await action(provider), loaded: true });
  } catch (error) {
    set({ error: String(error) });
  } finally {
    set({ busyId: null });
  }
}

export const useProviderAccountStore = create<ProviderAccountStore>((set) => ({
  accounts: [],
  busyId: null,
  error: "",
  loaded: false,

  refresh: async () => {
    try {
      set({ accounts: await listProviderAccounts(), error: "", loaded: true });
    } catch (error) {
      set({ error: String(error), loaded: true });
    }
  },

  connect: (provider) => runAction(set, provider, connectProviderAccount),
  cancel: (provider) => runAction(set, provider, cancelProviderAccount),
  disconnect: (provider) => runAction(set, provider, disconnectProviderAccount),
  openSignInPage: async (provider) => {
    try {
      await openProviderSignInPage(provider);
    } catch (error) {
      set({ error: String(error) });
    }
  },
}));
