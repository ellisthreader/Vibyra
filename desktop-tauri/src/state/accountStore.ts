import { create } from "zustand";

import {
  accountLoginEmail,
  accountLogout,
  accountOauthCancel,
  accountOauthStart,
  accountPasswordForgot,
  accountProfileRefresh,
  accountProfileUpdate,
  accountResendVerification,
  accountRestore,
  accountSignupEmail,
} from "../ipc/account";
import { clearTerminalSession } from "../ipc/session";
import type { AccountSnapshot } from "../types";

const INITIAL: AccountSnapshot = {
  status: "restoring",
  profile: null,
  error: null,
  pendingProvider: null,
  secureStorage: true,
};

interface AccountStore {
  snapshot: AccountSnapshot;
  busy: boolean;
  restore: () => Promise<void>;
  applySnapshot: (snapshot: AccountSnapshot) => void;
  clearError: () => void;
  loginEmail: (email: string, password: string) => Promise<void>;
  signupEmail: (name: string, email: string, password: string) => Promise<void>;
  startOauth: (provider: string) => Promise<void>;
  cancelOauth: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  /** Resolves to an inline error message, or null on success. */
  updateProfile: (name: string, email: string) => Promise<string | null>;
  /** Both resolve to a confirmation or failure message for inline display. */
  forgotPassword: (email: string) => Promise<string>;
  resendVerification: () => Promise<string>;
  logout: () => Promise<void>;
}

async function runAuthAction(
  set: (partial: Partial<AccountStore>) => void,
  get: () => AccountStore,
  action: () => Promise<AccountSnapshot>,
) {
  set({ busy: true, snapshot: { ...get().snapshot, error: null } });
  try {
    set({ snapshot: await action() });
  } catch (error) {
    set({ snapshot: { ...INITIAL, status: "signedOut", error: String(error) } });
  } finally {
    set({ busy: false });
  }
}

export const useAccountStore = create<AccountStore>((set, get) => ({
  snapshot: INITIAL,
  busy: false,

  restore: async () => {
    try {
      set({ snapshot: await accountRestore() });
    } catch (error) {
      set({ snapshot: { ...INITIAL, status: "connectionError", error: String(error) } });
    }
  },

  applySnapshot: (snapshot) => set({ snapshot }),

  clearError: () => set({ snapshot: { ...get().snapshot, error: null } }),

  loginEmail: (email, password) => runAuthAction(set, get, () => accountLoginEmail(email, password)),

  signupEmail: (name, email, password) =>
    runAuthAction(set, get, () => accountSignupEmail(name, email, password)),

  startOauth: (provider) => runAuthAction(set, get, () => accountOauthStart(provider)),

  cancelOauth: async () => {
    try {
      set({ snapshot: await accountOauthCancel() });
    } catch (error) {
      set({ snapshot: { ...get().snapshot, status: "signedOut", error: String(error) } });
    }
  },

  refreshProfile: async () => {
    try {
      set({ snapshot: await accountProfileRefresh() });
    } catch {
      // Keep the last known profile on transient failures.
    }
  },

  updateProfile: async (name, email) => {
    try {
      set({ snapshot: await accountProfileUpdate(name, email) });
      return null;
    } catch (error) {
      return String(error);
    }
  },

  forgotPassword: async (email) => {
    try {
      return await accountPasswordForgot(email);
    } catch (error) {
      return String(error);
    }
  },

  resendVerification: async () => {
    try {
      return await accountResendVerification();
    } catch (error) {
      return String(error);
    }
  },

  logout: async () => {
    set({ busy: true });
    try {
      await accountLogout();
    } catch (error) {
      console.error("Vibyra logout cleanup issue:", error);
    }
    // The saved session holds the signed-out user's terminals — and, with
    // scrollback saving on, their output. Discard it so it cannot be restored
    // into the next account to sign in on this machine.
    await clearTerminalSession().catch(() => {});
    // Reload so no account-scoped renderer state survives into the next
    // session; the credential is already cleared, so the app returns to
    // the authentication screen.
    window.location.reload();
  },
}));
