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
  accountTwoFactorCancel,
  accountTwoFactorSubmit,
} from "../ipc/account";
import { clearTerminalSession } from "../ipc/session";
import type { AccountSnapshot } from "../types";
import type { SignupDeclarations } from "../lib/signupDeclarations";

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
  signupEmail: (name: string, email: string, password: string, declarations: SignupDeclarations) => Promise<void>;
  startOauth: (provider: string, signup?: SignupDeclarations) => Promise<void>;
  cancelOauth: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  /** Resolves to an inline error message, or null on success. */
  updateProfile: (name: string, email: string, currentPassword?: string) => Promise<string | null>;
  /** Both resolve to a confirmation or failure message for inline display. */
  forgotPassword: (email: string) => Promise<string>;
  resendVerification: () => Promise<string>;
  /** The code half of a login, and abandoning it. */
  submitTwoFactor: (code: string) => Promise<void>;
  cancelTwoFactor: () => Promise<void>;
  logout: () => Promise<void>;
  /** Returns to the sign-in screen after native code has already ended the
   * session: signing this Mac out from Devices, or deleting the account. */
  endSession: () => Promise<void>;
}

/** The saved session holds the departing user's terminals — and, with
 * scrollback saving on, their output. Discard it so it cannot be restored
 * into the next account, then reload so no account-scoped renderer state
 * survives either. */
async function finishSession() {
  await clearTerminalSession().catch(() => {});
  window.location.reload();
}

/** The profile is re-fetched every minute and on every focus. Keeping the old
 * object when nothing changed spares everything subscribed to it a render. */
function unchangedOr(current: AccountSnapshot, next: AccountSnapshot): AccountSnapshot {
  return JSON.stringify(current) === JSON.stringify(next) ? current : next;
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

  applySnapshot: (snapshot) => set({ snapshot: unchangedOr(get().snapshot, snapshot) }),

  clearError: () => set({ snapshot: { ...get().snapshot, error: null } }),

  loginEmail: (email, password) => runAuthAction(set, get, () => accountLoginEmail(email, password)),

  signupEmail: (name, email, password, declarations) =>
    runAuthAction(set, get, () => accountSignupEmail(name, email, password, declarations)),

  startOauth: (provider, signup) => runAuthAction(set, get, () => accountOauthStart(provider, signup)),

  cancelOauth: async () => {
    try {
      set({ snapshot: await accountOauthCancel() });
    } catch (error) {
      set({ snapshot: { ...get().snapshot, status: "signedOut", error: String(error) } });
    }
  },

  refreshProfile: async () => {
    try {
      const prior = get().snapshot;
      const fresh = await accountProfileRefresh();
      if (get().snapshot === prior) set({ snapshot: unchangedOr(prior, fresh) });
    } catch {
      // Keep the last known profile on transient failures.
    }
  },

  updateProfile: async (name, email, currentPassword) => {
    try {
      set({ snapshot: await accountProfileUpdate(name, email, currentPassword) });
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

  submitTwoFactor: (code) => runAuthAction(set, get, () => accountTwoFactorSubmit(code)),

  cancelTwoFactor: async () => {
    try {
      set({ snapshot: await accountTwoFactorCancel() });
    } catch (error) {
      set({ snapshot: { ...get().snapshot, status: "signedOut", error: String(error) } });
    }
  },

  logout: async () => {
    set({ busy: true });
    try {
      await accountLogout();
    } catch (error) {
      console.error("Vibyra logout cleanup issue:", error);
    }
    await finishSession();
  },

  endSession: finishSession,
}));
