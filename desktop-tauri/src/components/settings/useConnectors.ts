import { connectorVersion, publishConnectorUpdate } from '../../lib/connectorUpdates';
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAccountStore } from "../../state/accountStore";
import { message, teammateApi } from "../teammates/api";

export interface Connector {
  id: string;
  name: string;
  tagline: string;
  installed: boolean;
  account: string | null;
  reads: string | null;
  writes: string | null;
  credential: { configured: boolean };
}

interface Catalogue {
  enabled: boolean;
  integrations: Connector[];
}

interface FlowStatus {
  status: string;
  error?: string;
  catalogue: Catalogue;
}

const POLL_MS = 2_000;
const POLL_LIMIT_MS = 5 * 60_000;

/**
 * The backend's connector catalogue (GitHub and friends), for the signed-in
 * Vibyra account. Connect starts the provider's OAuth flow, opens it in the
 * browser, and watches the flow until it lands — the user finishes in the
 * browser and comes back to a row that already says Connected.
 */
export function useConnectors() {
  const identity = useAccountStore((s) => s.snapshot.profile?.email ?? null);
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const alive = useRef(true);
  const flow = useRef<{ id: string; connector: string; started: number } | null>(null);

  const refresh = useCallback(async () => {
    if (!identity) return;
    try {
      const version = connectorVersion(identity);
      const data = await teammateApi<Catalogue>("connectors");
      if (!alive.current || identity !== useAccountStore.getState().snapshot.profile?.email || version !== connectorVersion(identity)) return;
      setCatalogue(data);
      setError("");
    } catch (cause) {
      setError(message(cause));
    }
  }, [identity]);

  useEffect(() => {
    alive.current = true;
    void refresh();
    return () => {
      alive.current = false;
    };
  }, [refresh]);

  // One poll loop for whichever flow is open. It stops the moment the flow
  // resolves, or after five minutes of nobody finishing in the browser.
  useEffect(() => {
    if (!pendingId) return;
    const timer = window.setInterval(async () => {
      const current = flow.current;
      if (!current) return;
      try {
        const data = await teammateApi<FlowStatus>(`connectors/flows/${current.id}`);
        if (!alive.current || flow.current !== current) return;
        setCatalogue(data.catalogue);
        if (identity) publishConnectorUpdate({ identity, catalogue: data.catalogue });
        if (data.status === "pending") {
          if (Date.now() - current.started > POLL_LIMIT_MS) {
            flow.current = null;
            setPendingId(null);
            setError("The sign-in timed out. Connect again.");
          }
          return;
        }
        flow.current = null;
        setPendingId(null);
        if (data.status !== "connected") setError(data.error ?? "The connection was not completed. Try again.");
      } catch (cause) {
        if (!alive.current) return;
        flow.current = null;
        setPendingId(null);
        setError(message(cause));
      }
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [pendingId]);

  const connect = async (id: string) => {
    setBusyId(id);
    setError("");
    try {
      const data = await teammateApi<{ flowId: string; url: string }>(`connectors/${id}/start`, {});
      flow.current = { id: data.flowId, connector: id, started: Date.now() };
      setPendingId(id);
      // The native bridge already opens the authorization URL.
      if (data.url) await invoke("shared_chat_open_link", { url: data.url });
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusyId(null);
    }
  };

  const disconnect = async (id: string) => {
    if (!identity) return;
    setBusyId(id);
    setError("");
    if (flow.current?.connector === id) { flow.current = null; setPendingId(null); }
    publishConnectorUpdate({ identity });
    try {
      const next = await teammateApi<Catalogue>(`connectors/${id}/disconnect`, {});
      if (identity !== useAccountStore.getState().snapshot.profile?.email) return;
      setCatalogue(next);
      publishConnectorUpdate({ identity, catalogue: next });
    } catch (cause) {
      setError(message(cause));
      publishConnectorUpdate({ identity, error: message(cause) });
    } finally {
      setBusyId(null);
    }
  };

  const cancel = () => {
    flow.current = null;
    setPendingId(null);
  };

  return { identity, catalogue, error, busyId, pendingId, connect, disconnect, cancel, refresh };
}
