import { useEffect, useRef, useState } from "react";
import { apiRequest } from "../api.js";
import { readPending, validReceipt } from "./ownerActionProtocol.js";

export default function useAccountAction({ ownerId, accountId, access, onComplete }) {
  const key = `vibyra-owner-action:${ownerId}:${accountId}`;
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState(null);
  const [storageReady, setStorageReady] = useState(false);
  const working = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    try { setPending(readPending(sessionStorage, key, accountId)); setStorageReady(true); }
    catch (caught) { setError(caught.message); }
    return () => { mounted.current = false; };
  }, [key, accountId]);
  const execute = async (kind, terms) => {
    if (working.current || !access.active() || !storageReady) return;
    working.current = true;
    setBusy(true); setError(""); setReceipt(null);
    const generation = access.epoch.current;
    let reference = pending;
    try {
      if (kind === "submit") {
        if (pending) return;
        reference = { request_id: crypto.randomUUID(), user_id: accountId, action: terms.action };
        // Persist only recovery metadata; no email, reason, warning text or credentials.
        sessionStorage.setItem(key, JSON.stringify(reference));
        setPending(reference);
      }
      const base = `/web-api/owner/accounts/${accountId}/actions`;
      const path = kind === "submit" ? base : `${base}/${reference.request_id}${kind === "cancel" ? "/cancel" : ""}`;
      const result = await apiRequest(path, { headers: { "X-Owner-Account": String(ownerId) },
        ...(kind === "check" ? {} : { body: kind === "submit" ? { ...terms, request_id: reference.request_id } : {} }) });
      if (!mounted.current || !access.accept(result, generation)) return;
      if (kind === "check" && result.ok === true && result.receipt === null) {
        setError("No completed action is recorded yet. Check again, or cancel the unconfirmed request before trying a new action.");
        return;
      }
      if (!validReceipt(result, reference, ownerId)) throw new Error("The action result could not be confirmed. Check its status before trying another action.");
      sessionStorage.removeItem(key);
      setPending(null); setReceipt(result.receipt);
      onComplete();
    } catch (caught) {
      if (!mounted.current || generation !== access.epoch.current) return;
      access.failure(caught, generation);
      setError(caught.message || "The result is unconfirmed. Check this request before trying again.");
    } finally {
      working.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return { pending, busy, error, receipt, storageReady,
    submit: terms => execute("submit", terms), check: () => execute("check"), cancel: () => execute("cancel") };
}
