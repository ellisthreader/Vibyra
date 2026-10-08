import { invoke } from "@tauri-apps/api/core";

import { normalizeSpendCaps, type CapKind, type SpendCaps, type SpendCapsChange } from "../lib/spendCaps";

/** The person's own spending limits. The native side fixes the route and checks every field. */

export async function accountSpendCaps(): Promise<SpendCaps | null> {
  return normalizeSpendCaps(await invoke("account_spend_caps"));
}

export async function accountSpendCapsSet(change: SpendCapsChange): Promise<SpendCaps | null> {
  return normalizeSpendCaps(await invoke("account_spend_caps_set", { change }));
}

export async function accountSpendCapsRaise(cap: CapKind): Promise<SpendCaps | null> {
  return normalizeSpendCaps(await invoke("account_spend_caps_raise", { cap, tokens: null }));
}
