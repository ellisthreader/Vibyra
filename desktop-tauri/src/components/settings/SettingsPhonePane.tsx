import { useEffect, useState } from "react";

import { PhoneFallback } from "./PhoneFallback";
import { SettingRow, SettingsBlock, Switch } from "./SettingsShared";
import { usePhoneStore } from "../../state/phoneStore";

/** One switch. Vibyra finds the network itself, announces this Mac to the
 * phone over Bonjour, and every phone still has to be allowed here by hand. */
export function SettingsPhonePane() {
  const status = usePhoneStore((state) => state.status);
  const busy = usePhoneStore((state) => state.busy);
  const error = usePhoneStore((state) => state.error);
  const configure = usePhoneStore((state) => state.configure);
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
  const live = status?.discoverable ?? false;
  const trouble = error || status?.error || "";
  return <div className="phone-connection">
    <SettingsBlock label="Live desktop terminals">
      <div className="settings-group">
        <SettingRow label="iPhone connection"
          hint="Your terminals, live on your phone. Open Vibyra on your iPhone, tap this Mac, and allow it here. Nothing to type.">
          <Switch checked={enabled} disabled={busy || !status} label="iPhone connection"
            onChange={(next) => void configure(next)} />
        </SettingRow>
        {enabled && <div className={`phone-state ${live ? "phone-state--live" : "phone-state--waiting"}`}>
          <span className={`phone-state__dot ${pulse ? "phone-state__dot--new" : ""}`} aria-hidden="true" />
          <div>
            <strong>{live ? "Visible to your iPhone on this network" : "Waiting for a network"}</strong>
            <p>{live
              ? "Open Vibyra on your iPhone and this Mac appears under nearby computers. Keep this Mac awake."
              : trouble || "Connect this Mac to Wi-Fi or a private VPN. Vibyra reconnects on its own."}</p>
          </div>
        </div>}
      </div>
    </SettingsBlock>
    {trouble && live && <p role="alert" className="phone-connection__error">{trouble}</p>}
    {enabled && <>
      <SettingsBlock label="Phones you allowed">
        {!status?.devices.length && <p className="phone-connection__hint">
          None yet. A phone that asks to connect appears here after you allow it.
        </p>}
        {status?.devices.map((device) => <div className="phone-connection__device" key={device.id}>
          <div>
            <strong>{device.name}</strong>
            <p className="phone-connection__hint">
              {status.active.includes(device.id) ? "Watching now · View only" : "Allowed · Not connected"}
            </p>
          </div>
          <button className="btn" type="button" disabled={busy}
            onClick={() => void revoke(device.id)}>Remove</button>
        </div>)}
        <p className="phone-connection__hint">
          An allowed phone sees live output from every terminal on this Mac, including anything
          printed there. It cannot type, run commands or read your files.
        </p>
      </SettingsBlock>
      <PhoneFallback ready={live} />
    </>}
  </div>;
}
