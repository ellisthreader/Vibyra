import { useCallback, useEffect, useRef, useState } from "react";
import { integrationRequest } from "./api";
import type { IntegrationRequest, IntegrationSnapshot } from "./types";

export function useIntegrations(agentId: string) {
  const [snapshot, setSnapshot] = useState<IntegrationSnapshot | null>(null);
  const [busy, setBusy] = useState<string | null>("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState<string | null>(null);
  const pending = useRef<string | null>(null);
  const alive = useRef(true);
  const locked = useRef(false);
  const refresh = useCallback(async () => {
    const next = await integrationRequest<IntegrationSnapshot>(agentId, { operation: "list" });
    if (alive.current) setSnapshot(next);
  }, [agentId]);

  useEffect(() => {
    alive.current = true;
    void refresh().catch((e) => { if (alive.current) setError(String(e)); })
      .finally(() => { if (alive.current) setBusy(null); });
    return () => {
      alive.current = false;
      if (pending.current) void integrationRequest(agentId, { operation: "cancel", id: pending.current }).catch(() => {});
    };
  }, [agentId, refresh]);

  useEffect(() => {
    if (!attempt) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const deadline = Date.now() + 10 * 60_000;
    const poll = async () => {
      try {
        const result = await integrationRequest<{ status: string }>(agentId, { operation: "poll", id: attempt });
        if (stopped) return;
        if (result.status !== "pending") {
          pending.current = null;
          setAttempt(null);
          if (result.status === "complete") {
            setNotice("Account connected. Enable it below to give this teammate read access.");
            await refresh();
          } else setError("The account wasn’t connected. Access may have been declined or expired. Try again.");
          return;
        }
      } catch (e) { if (!stopped) setError(String(e)); }
      if (stopped) return;
      if (Date.now() >= deadline) {
        pending.current = null;
        setAttempt(null);
        setError("This connection attempt expired. Try again.");
        void integrationRequest(agentId, { operation: "cancel", id: attempt }).catch(() => {});
      } else timer = setTimeout(poll, 2500);
    };
    timer = setTimeout(poll, 1500);
    return () => { stopped = true; clearTimeout(timer); };
  }, [attempt, agentId, refresh]);

  const act = async (key: string, request: IntegrationRequest) => {
    if (locked.current) return false;
    locked.current = true;
    setBusy(key); setError(""); setNotice("");
    try {
      const result = await integrationRequest<{ attemptId?: string }>(agentId, request);
      if (!alive.current) {
        if (result.attemptId) void integrationRequest(agentId, { operation: "cancel", id: result.attemptId }).catch(() => {});
        return false;
      }
      if (result.attemptId) { pending.current = result.attemptId; setAttempt(result.attemptId); }
      else {
        if (request.operation === "cancel") { pending.current = null; setAttempt(null); }
        if (request.operation === "check") setNotice("Connection checked: the account’s data is accessible.");
        if (request.operation === "disconnect") setNotice("Disconnected from Vibyra. You can also remove Vibyra in the provider’s account settings.");
        await refresh();
      }
      return true;
    } catch (e) { if (alive.current) { setError(String(e)); await refresh().catch(() => {}); } return false; }
    finally { locked.current = false; if (alive.current) setBusy(null); }
  };
  return { snapshot, busy, error, notice, attempt, act };
}
