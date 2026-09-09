import { create } from "zustand";

import {
  phoneAnswer,
  phoneConfigure,
  phoneRevoke,
  phoneStatus,
  type PhoneStatus,
} from "../ipc/phone";

/** One place the whole app reads the iPhone connection from, so a pairing
 * request can be approved from the workspace without opening Settings. */
interface PhoneStore {
  status: PhoneStatus | null;
  busy: boolean;
  error: string;
  refresh: () => Promise<void>;
  configure: (enabled: boolean) => Promise<void>;
  answer: (id: string, approve: boolean) => Promise<void>;
  revoke: (id: string) => Promise<void>;
}

async function run(
  set: (partial: Partial<PhoneStore>) => void,
  get: () => PhoneStore,
  task: () => Promise<PhoneStatus | void>,
): Promise<void> {
  if (get().busy) return;
  set({ busy: true, error: "" });
  try {
    const status = await task();
    set({ status: status ?? (await phoneStatus()) });
  } catch (cause) {
    set({ error: String(cause) });
    // The switch may have moved even when starting the listener failed.
    try {
      set({ status: await phoneStatus() });
    } catch {
      /* the next poll reports it */
    }
  } finally {
    set({ busy: false });
  }
}

export const usePhoneStore = create<PhoneStore>((set, get) => ({
  status: null,
  busy: false,
  error: "",
  refresh: async () => {
    if (get().busy) return;
    try {
      set({ status: await phoneStatus() });
    } catch (cause) {
      set({ error: String(cause) });
    }
  },
  configure: (enabled) => run(set, get, () => phoneConfigure(enabled)),
  answer: (id, approve) => run(set, get, () => phoneAnswer(id, approve)),
  revoke: (id) => run(set, get, () => phoneRevoke(id)),
}));
