import { create } from "zustand";
import { approvePhone } from "../lib/phoneApproval";
import { useAccountStore } from "./accountStore";

import {
  phoneConfigure,
  phoneRemoteDisconnectAll,
  phoneDisconnectDevice,
  phoneRevoke,
  phoneSetRemote,
  phoneSetNotifications,
  phoneSetTyping,
  phoneSetPreviewAuto,
  phoneStatus,
  phoneVaultChoose,
  phoneVaultClear,
  type PhoneStatus,
} from "../ipc/phone";

/** One place the whole app reads the iPhone connection from, so a pairing
 * request can be approved from the workspace without opening Settings. */
interface PhoneStore {
  status: PhoneStatus | null;
  /** Account under which this native status was obtained. */
  accountScope: string | null;
  busy: boolean;
  approvalOpen: boolean;
  error: string;
  refresh: () => Promise<void>;
  configure: (enabled: boolean) => Promise<void>;
  setTyping: (enabled: boolean) => Promise<void>;
  setPreviewAuto: (id: string, enabled: boolean) => Promise<void>;
  setNotifications: (enabled: boolean) => Promise<void>;
  setRemote: (enabled: boolean) => Promise<void>;
  disconnectRemote: () => Promise<void>;
  answer: (id: string, approve: boolean, previewAuto?: boolean) => Promise<boolean>;
  revoke: (id: string) => Promise<void>;
  /** Drops the live connection; the phone stays allowed. */
  disconnectDevice: (id: string) => Promise<void>;
  chooseVault: () => Promise<void>;
  clearVault: () => Promise<void>;
}

let accountGeneration = 0;

async function run(
  set: (partial: Partial<PhoneStore>) => void,
  get: () => PhoneStore,
  task: () => Promise<PhoneStatus | void>,
): Promise<void> {
  if (get().busy) return;
  const accountScope = useAccountStore.getState().snapshot.profile?.welcomeKey ?? null;
  const generation = accountGeneration;
  const current = () => generation === accountGeneration && accountScope === (useAccountStore.getState().snapshot.profile?.welcomeKey ?? null);
  set({ busy: true, error: "" });
  try {
    const status = await task();
    const next = status ?? (await phoneStatus());
    if (current()) set({ status: next, accountScope });
  } catch (cause) {
    if (!current()) return;
    set({ error: String(cause), status: null });
    // The switch may have moved even when starting the listener failed.
    try {
      const status = await phoneStatus();
      if (current()) set({ status, accountScope });
    } catch {
      /* the next poll reports it */
    }
  } finally {
    if (current()) set({ busy: false });
  }
}

export const usePhoneStore = create<PhoneStore>((set, get) => ({
  status: null,
  accountScope: null,
  busy: false,
  approvalOpen: false,
  error: "",
  refresh: async () => {
    if (get().busy) return;
    const accountScope = useAccountStore.getState().snapshot.profile?.welcomeKey ?? null;
    const generation = accountGeneration;
    const current = () => generation === accountGeneration && accountScope === (useAccountStore.getState().snapshot.profile?.welcomeKey ?? null);
    try {
      // Polled every two seconds: an unchanged status keeps its reference, so
      // nothing that reads it re-renders between real changes.
      const status = await phoneStatus();
      if (!current()) return;
      if (JSON.stringify(status) !== JSON.stringify(get().status) || get().accountScope !== accountScope) set({ status, accountScope });
    } catch (cause) {
      if (current()) set({ error: String(cause), status: null });
    }
  },
  configure: (enabled) => run(set, get, () => phoneConfigure(enabled)),
  setTyping: (enabled) => run(set, get, () => phoneSetTyping(enabled)),
  setPreviewAuto: (id, enabled) => run(set, get, () => phoneSetPreviewAuto(id, enabled)),
  setNotifications: (enabled) => run(set, get, () => phoneSetNotifications(enabled)),
  setRemote: (enabled) => run(set, get, () => phoneSetRemote(enabled)),
  disconnectRemote: () => run(set, get, () => phoneRemoteDisconnectAll()),
  answer: async (id, approve, previewAuto) => {
    if (get().busy) return false;
    const account = useAccountStore.getState().snapshot.profile?.welcomeKey;
    const generation = accountGeneration;
    let answered = false;
    await run(set, get, async () => {
      const status = await approvePhone(id, approve, previewAuto,
        () => generation === accountGeneration && useAccountStore.getState().snapshot.profile?.welcomeKey === account);
      answered = true;
      return status;
    });
    return answered;
  },
  revoke: (id) => run(set, get, () => phoneRevoke(id)),
  disconnectDevice: (id) => run(set, get, () => phoneDisconnectDevice(id)),
  chooseVault: () => run(set, get, () => phoneVaultChoose()),
  clearVault: () => run(set, get, () => phoneVaultClear()),
}));

// Native status from the previous account must not survive account replacement.
useAccountStore.subscribe((next, previous) => {
  if (next.snapshot.profile?.welcomeKey !== previous.snapshot.profile?.welcomeKey
    || (next.snapshot.status === "signedIn") !== (previous.snapshot.status === "signedIn")) {
    accountGeneration++;
    usePhoneStore.setState({ status: null, accountScope: null, busy: false, error: "" });
  }
});
