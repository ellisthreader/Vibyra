import { computerName } from "../../lib/platform";
import { useEffect, useState } from "react";

import type { PhoneDevice } from "../../ipc/phone";
import { usePhoneStore } from "../../state/phoneStore";
import { PhoneDeviceIcon, deviceKind } from "./PhoneDeviceIcon";
import { PhoneFallback } from "./PhoneFallback";
import { SettingRow, SettingsBlock, Switch } from "./SettingsShared";

const LEAVE_MS = 260;

/** "2 min ago", "3 h ago", "Yesterday", "12 Sep". Blank until a phone has connected. */
function ago(iso: string | undefined): string {
  if (!iso) return "";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(then).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** One line about where a phone is, or was: address and route. */
function whereabouts(device: PhoneDevice, online: boolean): string {
  const route = device.lastRoute === "cloud" ? "via Vibyra Cloud" : device.lastFrom ? `${device.lastFrom} · this network` : "";
  if (online) return route ? `Connected now · ${route}` : "Connected now";
  const when = ago(device.lastSeen);
  if (!when) return "Allowed, never connected";
  return route ? `${when} · ${route}` : when;
}

type Example = PhoneDevice & { online?: boolean };

/** Shown until a real phone has been allowed, so the list is never a blank
 * box. Clearly marked, removable only from the screen, and never real. */
const EXAMPLES: Example[] = [
  { id: "example-1", name: "Ellis’s iPhone", lastSeen: new Date(Date.now() - 90_000).toISOString(), lastFrom: "192.168.1.24", lastRoute: "nearby", online: true },
  { id: "example-2", name: "iPad Pro", lastSeen: new Date(Date.now() - 3 * 86_400_000).toISOString(), lastFrom: "Vibyra Cloud", lastRoute: "cloud" },
  { id: "example-3", name: "MacBook Air", lastSeen: new Date(Date.now() - 12 * 86_400_000).toISOString(), lastFrom: "10.0.0.7", lastRoute: "nearby" },
];

/**
 * Phone: one switch for remote phone control. Turning it on announces this
 * Mac nearby and, when signed in, reaches through Vibyra Cloud too, so a
 * phone works from anywhere without a second decision. Each allowed phone is
 * a row that folds away when removed.
 */
export function SettingsPhonePane() {
  const status = usePhoneStore((state) => state.status);
  const busy = usePhoneStore((state) => state.busy);
  const error = usePhoneStore((state) => state.error);
  const configure = usePhoneStore((state) => state.configure);
  const setTyping = usePhoneStore((state) => state.setTyping);
  const setPreviewAuto = usePhoneStore((state) => state.setPreviewAuto);
  const setRemote = usePhoneStore((state) => state.setRemote);
  const revoke = usePhoneStore((state) => state.revoke);
  const disconnectDevice = usePhoneStore((state) => state.disconnectDevice);
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const [hiddenExamples, setHiddenExamples] = useState<Set<string>>(new Set());
  // Settings is the one place the whole picture is shown, so it refreshes on
  // open even when the connection is off and the workspace poll is idle.
  useEffect(() => {
    void usePhoneStore.getState().refresh();
  }, []);

  const enabled = status?.enabled ?? false;
  const typing = status?.typing ?? false;
  const listening = status?.listening ?? status?.discoverable ?? false;
  const trouble = error || status?.error || "";
  const devices = [...(status?.devices ?? [])].sort((a, b) => {
    const activeA = status?.active.includes(a.id) ? 1 : 0;
    const activeB = status?.active.includes(b.id) ? 1 : 0;
    if (activeA !== activeB) return activeB - activeA;
    return (b.lastSeen ?? "").localeCompare(a.lastSeen ?? "");
  });
  const showingExamples = devices.length === 0;
  const rows: Example[] = showingExamples ? EXAMPLES.filter((e) => !hiddenExamples.has(e.id)) : devices;

  // The whole connection in one decision: nearby always, the cloud leg too
  // when this Mac is signed in. Off turns both off.
  const toggle = async (next: boolean) => {
    await configure(next);
    const remote = usePhoneStore.getState().status?.remote;
    if (remote && (next ? remote.signedIn && !remote.enabled : remote.enabled)) await setRemote(next);
  };

  // Disconnect keeps the row: the phone stays allowed and shows as offline,
  // with Remove then on offer. Remove folds the row away first, then lets
  // the host forget the phone; an example just leaves the screen.
  const disconnect = (id: string, example: boolean) => {
    if (example) return setHiddenExamples((prev) => new Set(prev).add(`${id}:online`));
    void disconnectDevice(id);
  };
  const remove = (id: string, example: boolean) => {
    setLeaving((prev) => new Set(prev).add(id));
    window.setTimeout(() => {
      setLeaving((prev) => { const next = new Set(prev); next.delete(id); return next; });
      if (example) setHiddenExamples((prev) => new Set(prev).add(id));
      else void revoke(id);
    }, LEAVE_MS);
  };

  return (
    <div className="phone-connection">
      <SettingsBlock label="Phone">
        <div className="settings-group">
          <SettingRow label="Remote phone control" hint={`Use Vibyra on your phone, nearby or from anywhere. Open the app on your phone and tap this ${computerName}.`}>
            <Switch checked={enabled} disabled={busy || !status} label="Remote phone control" onChange={(next) => void toggle(next)} />
          </SettingRow>
          {enabled && status?.remote?.signedIn && <SettingRow label="Computer updates on your phone" hint="Share task status with Vibyra Cloud for private alerts. No prompts or terminal text. Enable again after restarting or signing in.">
            <Switch checked={status.notifications ?? false} disabled={busy} label="Computer updates on your phone" onChange={(next) => void usePhoneStore.getState().setNotifications(next)} />
          </SettingRow>}
          {enabled && (
            <SettingRow label="Typing from your phone" hint="Type into terminals and answer agent requests from your phone.">
              <Switch checked={typing} disabled={busy || !status} label="Typing from your phone" onChange={(next) => void setTyping(next)} />
            </SettingRow>
          )}
        </div>
        {trouble ? <p role="alert" className="phone-connection__error">{trouble}</p> : null}
      </SettingsBlock>

      {enabled && (
        <SettingsBlock label="Phones" note={showingExamples ? "Examples until a phone connects. When one asks, you approve it here."
          : status?.previewAutoAvailable ? "Website Preview can show this phone sites running from your open project folders, including signed-in pages and cookies. It works while typing from your phone is on." : undefined}>
          <div className="settings-group">
            {rows.length === 0 ? <p className="phone-connection__hint phone-connection__hint--inset">No phones yet.</p> : null}
            {rows.map((device) => {
              const online = showingExamples ? Boolean(device.online) && !hiddenExamples.has(`${device.id}:online`) : (status?.active.includes(device.id) ?? false);
              const cls = ["device-row", showingExamples ? "device-row--example" : "", leaving.has(device.id) ? "device-row--leaving" : ""].join(" ").trim();
              return (
                <div key={device.id} className={cls}>
                  <div className="device-row__inner">
                    <div className="device-row__main">
                    <PhoneDeviceIcon kind={deviceKind(device.name)} online={online} />
                    <div className="device-row__text">
                      <span className="device-row__name">
                        <span className={`phone-dot ${online ? "phone-dot--on" : ""}`} aria-hidden="true" />{device.name}
                        {showingExamples ? <span className="device-row__tag">Example</span> : null}
                      </span>
                      <span className="device-row__where">{whereabouts(device, online)}</span>
                    </div>
                    {online ? (
                      <button className="btn btn--ghost" type="button" disabled={busy} onClick={() => disconnect(device.id, showingExamples)}>Disconnect</button>
                    ) : (
                      <button className="btn btn--ghost" type="button" disabled={busy || leaving.has(device.id)} onClick={() => remove(device.id, showingExamples)}>Remove</button>
                    )}
                    </div>
                    {!showingExamples && status?.previewAutoAvailable && <div className="device-row__preview">
                      <span>One-tap website Preview</span>
                      <Switch checked={device.previewAuto === true} disabled={busy}
                        label={`One-tap website Preview for ${device.name} ${device.id.slice(0, 6)}`}
                        onChange={(next) => void setPreviewAuto(device.id, next)} />
                    </div>}
                  </div>
                </div>
              );
            })}
          </div>
        </SettingsBlock>
      )}

      {enabled && <PhoneFallback ready={listening} />}
    </div>
  );
}
