import { useEffect, useState } from "react";

import { useMemoryStore } from "../../state/memoryStore";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { StatusChip } from "./SettingsControls";
import { SettingRow, SettingsBlock } from "./SettingsShared";
import { IntegrationLogo } from "./IntegrationLogo";
import { useConnectors, type Connector } from "./useConnectors";

const MEMORY_KEY = "global";


/** One backend connector as a line: mark, name, what it is connected as, one action. */
function ConnectorRow({
  connector,
  busy,
  pending,
  signedIn,
  onConnect,
  onDisconnect,
  onCancel,
}: {
  connector: Connector;
  busy: boolean;
  pending: boolean;
  signedIn: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onCancel: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const openAccount = useWorkspaceStore((s) => s.openSettingsSection);
  const available = connector.credential.configured;
  const hint = connector.installed
    ? connector.account ? `Connected as ${connector.account}` : "Connected"
    : pending ? "Finish signing in in your browser."
      : connector.tagline || connector.reads || "";
  const unavailableHint = "Not available on the Vibyra service yet.";
  return (
    <SettingRow label={<><IntegrationLogo id={connector.id} />{connector.name}</>} hint={hint}>
      {!signedIn ? (
        <button className="btn btn--ghost integration-quiet" onClick={() => openAccount("account")}>Sign in to Vibyra first</button>
      ) : connector.installed ? (
        confirm ? (
          <>
            <button className="btn btn--ghost integration-quiet" onClick={() => setConfirm(false)}>Keep</button>
            <button className="btn btn--danger" disabled={busy} onClick={() => { setConfirm(false); onDisconnect(); }}>Disconnect</button>
          </>
        ) : (
          <>
            <StatusChip tone="on">Connected</StatusChip>
            <button className="btn btn--ghost integration-quiet" disabled={busy} onClick={() => setConfirm(true)}>Disconnect</button>
          </>
        )
      ) : pending ? (
        <>
          <StatusChip tone="busy">Waiting for browser</StatusChip>
          <button className="btn btn--ghost integration-quiet" onClick={onCancel}>Cancel</button>
        </>
      ) : available ? (
        <button className="btn btn--primary" disabled={busy} onClick={onConnect}>{busy ? "Opening…" : "Connect"}</button>
      ) : (
        <span className="integration-unavailable" title={unavailableHint}>Coming soon</span>
      )}
    </SettingRow>
  );
}

/** The Mac-wide Obsidian vault the companion reads notes from. Detected vaults
 * are offered first; any folder of markdown works through the picker. */
function ObsidianRow() {
  const sources = useMemoryStore((s) => s.sources[MEMORY_KEY]);
  const load = useMemoryStore((s) => s.load);
  const connect = useMemoryStore((s) => s.connectVault);
  const disconnect = useMemoryStore((s) => s.disconnectVault);
  const busy = useMemoryStore((s) => s.sourceBusy);
  const [confirm, setConfirm] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [pick, setPick] = useState("");
  useEffect(() => {
    void load(MEMORY_KEY);
  }, [load]);
  const vault = sources?.vault ?? null;
  const suggestions = sources?.suggestions ?? [];
  const hint = vault
    ? `${vault.name} · ${vault.noteCount.toLocaleString()}${vault.countLimited ? "+" : ""} notes, read-only`
    : choosing ? "Which vault should Vibyra read?" : "Your notes, read-only, for chats and agents.";
  // Connect first; only then is there a choice to make. With nothing
  // detected the folder picker opens straight away.
  const begin = () => {
    if (suggestions.length === 0) return void connect(MEMORY_KEY);
    setPick(suggestions[0].id);
    setChoosing(true);
  };
  const finish = () => {
    setChoosing(false);
    void connect(MEMORY_KEY, pick && pick !== "__other" ? pick : undefined);
  };
  return (
    <SettingRow label={<><IntegrationLogo id="obsidian" />Obsidian</>} hint={hint}>
      {vault ? (
        confirm ? (
          <>
            <button className="btn btn--ghost integration-quiet" onClick={() => setConfirm(false)}>Keep</button>
            <button className="btn btn--danger" disabled={busy} onClick={() => { setConfirm(false); void disconnect(MEMORY_KEY); }}>Disconnect</button>
          </>
        ) : (
          <>
            <StatusChip tone="on">Connected</StatusChip>
            <button className="btn btn--ghost integration-quiet" disabled={busy} onClick={() => setConfirm(true)}>Disconnect</button>
          </>
        )
      ) : choosing ? (
        <>
          <select className="input input--sm" aria-label="Detected vaults" value={pick} onChange={(event) => setPick(event.target.value)}>
            {suggestions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            <option value="__other">Another folder…</option>
          </select>
          <button className="btn btn--ghost integration-quiet" onClick={() => setChoosing(false)}>Cancel</button>
          <button className="btn btn--primary" disabled={busy} onClick={finish}>Use this vault</button>
        </>
      ) : (
        <button className="btn btn--primary" disabled={busy} onClick={begin}>Connect</button>
      )}
    </SettingRow>
  );
}

/**
 * Integrations: services Vibyra can reach on your behalf. GitHub goes through
 * the backend's OAuth broker with the credential held server-side; Obsidian is
 * a folder on this Mac. Neither has anything to do with terminal accounts.
 */
export function IntegrationsBlock() {
  const { identity, catalogue, error, busyId, pendingId, connect, disconnect, cancel } = useConnectors();
  const connectors = (catalogue?.integrations ?? []).filter((c) => c.id === "github" || c.installed);
  return (
    <SettingsBlock label="Integrations" panel="integrations" note="Connect the services your agents and chats can use.">
      <div className="settings-group">
        {connectors.map((connector) => (
          <ConnectorRow
            key={connector.id}
            connector={connector}
            busy={busyId === connector.id}
            pending={pendingId === connector.id}
            signedIn={Boolean(identity)}
            onConnect={() => void connect(connector.id)}
            onDisconnect={() => void disconnect(connector.id)}
            onCancel={cancel}
          />
        ))}
        {identity && !catalogue && !error ? <p className="integration-loading">Checking connected services…</p> : null}
        <ObsidianRow />
      </div>
      {error ? <p className="integration-error" role="alert">{error}</p> : null}
    </SettingsBlock>
  );
}
