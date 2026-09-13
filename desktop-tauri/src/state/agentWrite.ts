import { invoke } from "@tauri-apps/api/core";
import { useAccountStore } from "./accountStore";

type Receipt = { operation: string; result: unknown; deleted?: boolean };
type Pending = { token: string; fingerprint: string };
const flights = new Map<string, Promise<unknown>>();
const journal = new Map<string, Pending>();
const prefix = "vibyra.agent-save.";
const timeoutMs = 15_000;

export function agentAccount(): string {
  return useAccountStore.getState().snapshot.profile?.welcomeKey ?? "signed-out";
}

function read(key: string): Pending | undefined {
  try {
    const raw = localStorage.getItem(prefix + key);
    if (!raw) return undefined;
    if (raw) {
      const value = JSON.parse(raw) as Pending;
      if (typeof value.token === "string" && typeof value.fingerprint === "string") return value;
    }
  } catch { /* In-memory receipts still protect this window if storage is unavailable. */ }
  return journal.get(key);
}
function remember(key: string, value?: Pending) {
  if (value) journal.set(key, value); else journal.delete(key);
  try {
    if (value) localStorage.setItem(prefix + key, JSON.stringify(value));
    else localStorage.removeItem(prefix + key);
  } catch { /* Do not turn a successful native write into a local-storage error. */ }
}

/** No raw drafts in the journal. Native receipts are authoritative after reload. */
export function agentWrite<T>(
  slot: string, payload: unknown, write: (token: string) => Promise<T>,
  apply: (value: T) => void, fail: (error: string) => void,
): Promise<T> {
  const account = agentAccount();
  const key = `${account}:${slot}`;
  let timedOut = false;
  let operation = flights.get(key) as Promise<T> | undefined;
  if (operation) return Promise.reject(new Error("This item is still saving. Wait for its result before submitting again."));
  operation = (async () => {
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(payload)));
    const fingerprint = Array.from(new Uint8Array(hash), x => x.toString(16).padStart(2, "0")).join("");
    if (agentAccount() !== account) throw new Error("The account changed. Reopen this form.");
    const prior = read(key);
    const request = prior ?? { token: crypto.randomUUID(), fingerprint };
    if (prior) {
      const saved = await invoke<Receipt | null>("agent_write_receipt", { requestId: prior.token });
      if (agentAccount() !== account) throw new Error("The account changed. Reopen this form.");
      if (saved) {
        if (saved.deleted) { remember(key); throw new Error("The earlier save completed, but that item was deleted. Submit again to create a new item."); }
        if (agentAccount() === account) apply(saved.result as T);
        if (!timedOut) remember(key);
        if (prior.fingerprint !== fingerprint) throw new Error("The earlier save completed. Check the saved item, then submit your new changes.");
        return saved.result as T;
      }
    }
    // Keep the same token while an earlier outcome is uncertain. Native code
    // rejects different content if the earlier request commits first.
    remember(key, { token: request.token, fingerprint });
    let value: T;
    try { value = await write(request.token); } catch (error) {
      if (String(error).includes("SAVE_CONFLICT:")) {
        remember(key, request);
        throw new Error(String(error).split("SAVE_CONFLICT:")[1].trim());
      }
      throw error;
    }
    // A timed-out form can still retry. Keep its receipt until that retry
    // acknowledges late success, otherwise it would create a second item.
    if (!timedOut) remember(key);
    if (agentAccount() !== account) throw new Error("Saved to the previous account. Reopen this form.");
    apply(value);
    return value;
  })().catch(error => { if (agentAccount() === account) fail(String(error)); throw error; }).finally(() => { if (flights.get(key) === operation) flights.delete(key); });
  flights.set(key, operation);
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      timedOut = true;
      const message = "The save has not been confirmed yet. You can close this form; check the saved list before retrying.";
      if (agentAccount() === account) fail(message);
      reject(new Error(message));
    }, timeoutMs);
    operation!.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}
