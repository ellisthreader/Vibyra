import { useCallback, useEffect, useState } from "react";
import { cloudSync } from "../../ipc/cloudSync";
import { cloudPage } from "../../ipc/cloudPage";
import { connectError } from "../../lib/cloudTab";
import type { SyncStatus } from "../../lib/cloudSyncClient";
import { readCloudScope, useCloudAvailability, useCloudSetupAvailability } from "../../state/cloudAvailability";
import { useAccountStore } from "../../state/accountStore";
import { useSettingsStore } from "../../state/settingsStore";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { CloudShape } from "../cloud/CloudShape";
import { ConnectCloudFlow } from "../cloud/ConnectCloudFlow";
import { SceneSky } from "../cloud/SceneSky";
import { CloudUpdatesPage } from "../cloud/page/CloudUpdatesPage";
import "../cloud/cloud-entry.css";

export function SettingsCloudPane() {
  const scope = useCloudAvailability();
  const account = useAccountStore((state) => state.snapshot.profile?.welcomeKey ?? null);
  return scope && account ? <CloudDestination key={account} scope={scope} /> : null;
}

function CloudDestination({ scope }: { scope: string }) {
  const setupScope = useCloudSetupAvailability();
  const activeProjectId = useSettingsStore((s) => s.settings?.activeProjectId ?? null);
  const close = useWorkspaceStore((s) => s.closeSettings);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [flow, setFlow] = useState(false);
  const refresh = useCallback(() => setAttempt((n) => n + 1), []);
  useEffect(() => {
    let live = true, reading = false;
    const read = async () => {
      if (reading || document.hidden || readCloudScope() !== scope) return;
      reading = true;
      try {
        const [next, overview] = await Promise.all([cloudSync.status(), cloudPage.read()]);
        if (live && readCloudScope() === scope) { setStatus(next); setConnected(overview.connected); setEnabled(overview.enabled); setError(""); }
      } catch (cause) { if (live && readCloudScope() === scope) setError(connectError(cause)); }
      finally { reading = false; }
    };
    if (flow || connected) return;
    void read();
    const timer = window.setInterval(() => void read(), 5000);
    const visible = () => { if (!document.hidden) void read(); };
    document.addEventListener("visibilitychange", visible);
    return () => { live = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [attempt, scope, flow, connected]);
  const done = () => { setFlow(false); setConnected(null); setStatus(null); refresh(); };

  // Once explicitly opened, setup owns its route through the flight until Done/Cancel.
  return <>
    <ConnectCloudFlow open={flow} activeProjectId={activeProjectId} onClose={() => { setFlow(false); refresh(); }} onDone={done} />
    {!flow && connected ? <CloudUpdatesPage key={scope} onDisconnected={() => { setConnected(false); setStatus(null); refresh(); }} /> :
      <section className="cloud-entry" aria-label="Vibyra Cloud">
        <SceneSky dawn={false} />
        <header className="cloud-entry__header"><h2>Vibyra Cloud</h2><button className="cloud-entry__close" aria-label="Close Vibyra Cloud" onClick={close}>×</button></header>
        <div className="cloud-entry__body">
          <div className="cloud-entry__art" aria-hidden="true"><CloudShape level={0} tick={false} glow={0.6} /></div>
          <h3>Your work, wherever you are.</h3>
          <p>Keep your selected projects ready in Vibyra Cloud, even when your computer sleeps.</p>
          {!status && !error && <p role="status">Checking Vibyra Cloud…</p>}
          {!enabled || status?.gate === "unavailable" ? <p role="status">{status?.message || "Vibyra Cloud is not available on this account yet."}</p> :
            <button className="cc-button" disabled={!setupScope || !status || status.gate === "starting" || status.gate === "signedOut" || !!error} onClick={() => setFlow(true)}>Connect to cloud</button>}
          {error && <><p className="cc-error" role="alert">{error}</p><button className="cc-link" onClick={refresh}>Try again</button></>}
        </div>
      </section>}
  </>;
}
