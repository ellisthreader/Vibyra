import { useEffect, useState } from "react";

import { PhoneFallback } from "./PhoneFallback";
import { RemoteAccessRow } from "./RemoteAccessRow";
import { SettingRow, SettingsBlock, Switch } from "./SettingsShared";
import { VaultRow } from "./VaultRow";
import { usePhoneStore } from "../../state/phoneStore";

/** One switch. Vibyra finds the network itself, announces this Mac to the
 * phone over Bonjour, and every phone still has to be allowed here by hand. */
export function SettingsPhonePane() {
  const status = usePhoneStore((state) => state.status);
  const busy = usePhoneStore((state) => state.busy);
  const error = usePhoneStore((state) => state.error);
  const configure = usePhoneStore((state) => state.configure);
  const setTyping = usePhoneStore((state) => state.setTyping);
  const revoke = usePhoneStore((state) => state.revoke);
  const [pulse, setPulse] = useState(false);
  // Settings is the one place the whole picture is shown, so it refreshes on
  // open even when the connection is off and the workspace poll is idle.
  useEffect(() => {
    void usePhoneStore.getState().refresh();
  }, []);
  useEffect(() => {
    if (!status?.discoverable) return;
    setPulse(true);
    const timer = window.setTimeout(() => setPulse(false), 1_200);
    return () => window.clearTimeout(timer);
  }, [status?.discoverable]);
  const enabled = status?.enabled ?? false;
  const typing = status?.typing ?? false;
  const live = status?.discoverable ?? false;
  const listening = status?.listening ?? live;
  const trouble = error || status?.error || "";
  return <div className="phone-connection">
    <SettingsBlock label="Connection">
      <div className="settings-group">
        <SettingRow label="iPhone connection"
          hint="Open Vibyra on your iPhone, tap this Mac, and allow it here. No code needed.">
          <Switch checked={enabled} disabled={busy || !status} label="iPhone connection"
            onChange={(next) => void configure(next)} />
        </SettingRow>
        {enabled && <div className={`phone-state ${live ? "phone-state--live" : "phone-state--waiting"}`}>
          <span className={`phone-state__dot ${pulse ? "phone-state__dot--new" : ""}`} aria-hidden="true" />
          <div>
            <strong>{live ? "Visible to your iPhone on this network" : listening ? "Starting nearby discovery" : "Waiting for a network"}</strong>
            <p>{live
              ? "Open Vibyra on your iPhone and this Mac appears under nearby computers. Keep this Mac awake."
              : listening ? "Your connection is on. Vibyra is retrying nearby discovery; you can also use the link below."
                : trouble || "Connect this Mac to Wi-Fi or a private VPN. Vibyra reconnects on its own."}</p>
          </div>
        </div>}
        {/* Watching and typing are separate permissions: typing into a shell
            runs anything this Mac's user can, so it waits to be turned on. */}
        {enabled && <SettingRow label="Typing from your phone"
          hint="Type into terminals, send agent instructions and answer agent requests from your iPhone. These run on this Mac.">
          <Switch checked={typing} disabled={busy || !status} label="Typing from your phone"
            onChange={(next) => void setTyping(next)} />
        </SettingRow>}
        {/* Where an allowed phone may arrive from: this network only, or any
            network through Vibyra Cloud on the same account. */}
        {enabled && <RemoteAccessRow remote={status?.remote} busy={busy || !status} />}
      </div>
    </SettingsBlock>
    {trouble && live && <p role="alert" className="phone-connection__error">{trouble}</p>}
    <SettingsBlock label="Notes">
      <div className="settings-group">
        <VaultRow vault={status?.vault} busy={busy || !status} />
      </div>
    </SettingsBlock>
    {enabled && <>
      <SettingsBlock label="Phones you allowed">
        <div className="settings-group phone-connection__devices">
        {!status?.devices.length && <p className="phone-connection__hint phone-connection__hint--inset">
          None yet. A phone that asks to connect appears here after you allow it.
        </p>}
        {status?.devices.map((device) => <div className="phone-connection__device" key={device.id}>
          <div>
            <strong>{device.name}</strong>
            <p className="phone-connection__hint">
              {!status.active.includes(device.id) ? "Allowed · Not connected"
                : typing ? "Connected now · Can type" : "Watching now · View only"}
            </p>
          </div>
          <button className="btn" type="button" disabled={busy}
            onClick={() => void revoke(device.id)}>Remove</button>
        </div>)}
        </div>
        <p className="phone-connection__hint">
          {typing
            ? "An allowed phone sees all terminal conversations and output. It can type, send agent instructions and answer agent permission requests. Agents can change files when instructed."
            : "An allowed phone sees all terminal conversations and output, including anything printed there. Sending messages and responding to agent requests is off."}
        </p>
      </SettingsBlock>
      <PhoneFallback ready={listening} />
    </>}
  </div>;
}
