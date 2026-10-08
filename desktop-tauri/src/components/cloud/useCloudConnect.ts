import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cloudSync } from "../../ipc/cloudSync";
import { cloudPage } from "../../ipc/cloudPage";
import { CLOUD_CONSENT_VERSION } from "../../lib/cloudCopy";
import type { CloudOverview } from "../../lib/cloudOverviewTypes";
import type { SyncStatus } from "../../lib/cloudSyncClient";
import { connectError, defaultPick, recentFirst } from "../../lib/cloudTab";
import { readCloudSetupScope } from "../../state/cloudAvailability";
import type { CloudAccounts } from "./ConnectSteps";
import type { ScenePhase } from "./CloudScene";

/** One user attempt owns consent, wake and its receipts. Closing or replacing its scope fences late work. */
export function useCloudConnect(scope: string, activeProjectId: string | null) {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [overview, setOverview] = useState<CloudOverview | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [retained, setRetained] = useState<string[]>([]);
  const [accounts, setAccounts] = useState<CloudAccounts>({ claude: true, codex: true, github: true });
  const [agreed, setAgreed] = useState(false);
  const [phase, setPhase] = useState<ScenePhase>("waiting");
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");
  const [pollError, setPollError] = useState("");
  const [wakeState, setWakeState] = useState<"idle" | "starting" | "started" | "failed">("idle");
  const initialProject = useRef(activeProjectId).current;
  const [wakeFailed, setWakeFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const alive = useRef(true);
  const acting = useRef(false);
  const current = useCallback(() => alive.current && scope === readCloudSetupScope(), [scope]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let live = true;
    setError("");
    void Promise.all([cloudSync.status(), cloudPage.read()]).then(([next, access]) => {
      if (!live || !current()) return;
      setStatus(next);
      const first = defaultPick(next.projects, initialProject);
      const existing = next.projects.filter(p => access.projects.some(row => row.allowed && row.projectKey === p.projectKey)).map(p => p.id);
      setRetained(existing);
      setPicked(existing.length ? existing : first ? [first] : []);
      setAccounts({ claude: access.providers.claude.enabled ?? true, codex: access.providers.codex.enabled ?? true, github: access.providers.github.enabled ?? true });
    }).catch((cause) => { if (live && current()) setError(connectError(cause)); });
    return () => { live = false; };
  }, [retry, initialProject, current]);

  const shelf = useMemo(() => recentFirst(status?.projects ?? [], activeProjectId), [status, activeProjectId]);
  const chosen = useMemo(() => shelf.filter((p) => picked.includes(p.id)), [shelf, picked]);
  // A local upload receipt cannot say the VM has applied it. Only account access read after Connect counts.
  const arrived = chosen.filter((p) => overview?.projects.some((row) => {
    if (!p.projectKey || row.projectKey !== p.projectKey || !row.allowed) return false;
    return row.cloud.status ? ["ready", "running", "diverged"].includes(row.cloud.status.phase)
      : row.cloud.state === "synced" || row.cloud.state === "diverged";
  })).map((p) => p.id);
  const landed = accepted && !!overview && wakeState === "started" && overview.computer?.chip === "running" && arrived.length === chosen.length;
  useEffect(() => { if (landed) setPhase("landed"); }, [landed]);
  useEffect(() => {
    if (!accepted || phase === "landed" || wakeState === "starting" || wakeState === "idle") return;
    let live = true, reading = false;
    let timer: number | undefined;
    const read = async () => {
      if (!live || reading || !current() || document.hidden) return;
      reading = true;
      try {
        const next = await cloudPage.read();
        if (live && current()) { setOverview(next); setPollError(""); }
      } catch (cause) { if (live && current()) setPollError(connectError(cause)); }
      finally {
        reading = false;
        if (live && current() && !document.hidden) timer = window.setTimeout(() => void read(), 3000);
      }
    };
    const visibility = () => { window.clearTimeout(timer); if (!document.hidden) void read(); };
    void read(); document.addEventListener("visibilitychange", visibility);
    return () => { live = false; window.clearTimeout(timer); document.removeEventListener("visibilitychange", visibility); };
  }, [accepted, phase, wakeState, current]);

  const wake = async () => {
    if (!current()) return;
    setWakeState("starting"); setWakeFailed(false); setError(""); setPollError("");
    try {
      const next = await cloudPage.action("wake");
      if (current()) { setOverview(next); setWakeState("started"); setPhase("flying"); }
    } catch (cause) {
      if (current()) { setWakeState("failed"); setWakeFailed(true); setError(connectError(cause)); setPhase("flying"); }
    }
  };
  const connect = async (accounts: Partial<CloudAccounts>) => {
    if (!current() || acting.current || !agreed || !status || accepted) return;
    acting.current = true; setError(""); setOverview(null); setPhase("connecting");
    try {
      const next = await cloudSync.connectMac(chosen.map(({ id, name }) => ({ id, name })), {
        includeConversations: status.includeConversations, includeEnv: false,
        consentVersion: CLOUD_CONSENT_VERSION, accounts,
      });
      if (!current()) return;
      setStatus(next); setAccepted(true); setPhase("flying");
      await wake();
    } catch (cause) {
      if (current()) { setError(connectError(cause)); setAgreed(false); setPhase("waiting"); }
    } finally { acting.current = false; }
  };
  const retryWake = async () => {
    if (!current() || acting.current) return;
    acting.current = true;
    try { await wake(); } finally { acting.current = false; }
  };
  return { status, shelf, chosen, picked, retained, accounts, setAccounts,
    setPicked: (next: string[]) => setPicked([...new Set([...retained, ...next])]), agreed, setAgreed, phase, accepted, arrived, error: error || pollError, wakeFailed,
    connect, retryWake, retryLoad: () => setRetry((n) => n + 1) };
}
