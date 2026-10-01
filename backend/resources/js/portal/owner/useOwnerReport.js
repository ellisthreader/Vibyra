import { useEffect, useState } from "react";
import { apiRequest } from "../api.js";
import { reportForIdentity } from "./reportIdentity.js";

export default function useOwnerReport(days, user) {
  const [snapshot, setSnapshot] = useState(null);
  const userId = user?.id ?? null;
  const [pending, setPending] = useState(true);
  const [error, setError] = useState("");

  const [attempt, setAttempt] = useState(0);
  useEffect(() => { setSnapshot(null); setError(""); }, [userId]);
  useEffect(() => {
    if (userId == null) return;
    let cancelled = false;
    let inFlight = false;
    let timer;
    let controller;
    const load = async () => {
      if (cancelled || inFlight) return;
      if (document.hidden) { timer = window.setTimeout(load, 60_000); return; }
      inFlight = true;
      setPending(true);
      controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 15_000);
      let delay = 60_000;
      try {
        const payload = await apiRequest(`/web-api/owner/analytics?days=${days}`, { signal: controller.signal });
        if (!cancelled) { setSnapshot({ userId, data: payload, updatedAt: new Date() }); setError(""); }
      } catch (caught) {
        if (cancelled) return;
        if (caught.status === 401) { window.location.assign("/owner/login"); return; }
        if (caught.status === 403) setSnapshot(null);
        setError(caught.status === 403 ? "This account does not have access to the owner workspace."
          : "The latest figures could not load. We’ll retry automatically; you can also refresh now.");
        delay = caught.status === 403 ? 60_000 : 15_000;
      } finally {
        window.clearTimeout(timeout);
        inFlight = false;
        if (!cancelled) { setPending(false); timer = window.setTimeout(load, delay); }
      }
    };
    const visible = () => { if (!document.hidden) { window.clearTimeout(timer); load(); } };
    load();
    document.addEventListener("visibilitychange", visible);
    return () => { cancelled = true; controller?.abort(); window.clearTimeout(timer); document.removeEventListener("visibilitychange", visible); };
  }, [days, userId, attempt]);
  const report = reportForIdentity(snapshot, userId);
  return { data: report?.data ?? null, pending, error, updatedAt: report?.updatedAt ?? null, refresh: () => setAttempt(value => value + 1) };
}
