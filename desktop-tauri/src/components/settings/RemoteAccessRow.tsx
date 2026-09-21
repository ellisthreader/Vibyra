import { SettingRow, Switch } from "./SettingsShared";
import type { RemoteStatus } from "../../ipc/phone";
import { usePhoneStore } from "../../state/phoneStore";

/** What the cloud leg is doing, in one line, from what the backend reports. */
function describeRemote(remote: RemoteStatus | undefined): { live: boolean; title: string; detail: string } {
  const leg = remote?.leg;
  if (!remote?.enabled) return { live: false, title: "Off", detail: "" };
  if (!leg || leg.state === "waiting") {
    return { live: false, title: remote.signedIn ? "Starting remote access" : "Sign in to Vibyra on this Mac",
      detail: leg?.error ?? "Remote access uses your Vibyra account so only your own phones can reach this Mac." };
  }
  if (leg.state === "online") {
    const phones = leg.clients === 1 ? "1 phone connected now" : `${leg.clients} phones connected now`;
    return { live: true, title: "Reachable from anywhere", detail: leg.clients ? phones : "Open Vibyra on your iPhone on any network and tap this Mac. Keep this Mac awake." };
  }
  if (leg.state === "error") return { live: false, title: "Vibyra Cloud can't be reached", detail: `${leg.error ?? "Retrying."} Vibyra keeps retrying on its own.` };
  return { live: false, title: "Connecting to Vibyra Cloud", detail: "One moment." };
}

/** Remote access: its own switch under the connection, with the emergency
 * action beside it. Every phone still has to be allowed on this Mac first;
 * the cloud only changes which networks an allowed phone can arrive from. */
export function RemoteAccessRow({ remote, busy }: { remote: RemoteStatus | undefined; busy: boolean }) {
  const setRemote = usePhoneStore((state) => state.setRemote);
  const disconnectRemote = usePhoneStore((state) => state.disconnectRemote);
  const words = describeRemote(remote);
  const clients = remote?.leg?.clients ?? 0;
  return <>
    <SettingRow label="Remote access"
      hint="Reach this Mac from anywhere through Vibyra Cloud, on your account only. Your terminals stay encrypted end to end; Vibyra can't read them.">
      <Switch checked={remote?.enabled ?? false} disabled={busy || !remote} label="Remote access"
        onChange={(next) => void setRemote(next)} />
    </SettingRow>
    {remote?.enabled && <div className={`phone-state ${words.live ? "phone-state--live" : "phone-state--waiting"}`}>
      <span className="phone-state__dot" aria-hidden="true" />
      <div>
        <strong>{words.title}</strong>
        <p>{words.detail}</p>
        {clients > 0 && <button className="btn phone-remote__cut" type="button" disabled={busy}
          onClick={() => void disconnectRemote()}>Disconnect all remote sessions</button>}
      </div>
    </div>}
  </>;
}
