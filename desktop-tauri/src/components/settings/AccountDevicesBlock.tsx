import { computerName } from "../../lib/platform";
import { useCallback, useEffect, useState } from "react";

import { accountDeviceRevoke, accountDevices, accountDevicesRevokeAll } from "../../ipc/accountSecurity";
import { logoutConfirmCopy } from "../../lib/accountPolicy";
import { useAccountStore } from "../../state/accountStore";
import { useTerminalStore } from "../../state/terminalStore";
import type { AccountDevice } from "../../types";
import { StatusChip } from "./SettingsControls";
import { SettingRow, SettingsBlock } from "./SettingsShared";

/** Somewhere between "just now" and a date, which is all anyone wants to
 * know about a device they are deciding whether to keep. */
function lastActive(iso: string | null): string {
  if (!iso || Number.isNaN(Date.parse(iso))) return "";
  const when = new Date(iso);
  const minutes = Math.round((Date.now() - when.getTime()) / 60_000);
  if (minutes < 5) return "Active now";
  if (minutes < 60) return `Active ${minutes} minutes ago`;
  if (minutes < 60 * 24) return `Active ${when.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" })}`;
  return `Last active ${when.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
}

/** Every device this account is signed in on. Signing this Mac out here is
 * the same ending as Log out, so it closes terminals the same way. */
export function AccountDevicesBlock() {
  const running = useTerminalStore((s) => s.panes.filter((p) => p.status === "running").length);
  const [devices, setDevices] = useState<AccountDevice[] | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    void accountDevices()
      .then(setDevices)
      .catch((cause) => setError(String(cause)));
  }, []);
  useEffect(load, [load]);

  const run = async (key: string, action: () => Promise<{ signedOut: boolean }>) => {
    setBusy(key);
    setError(null);
    try {
      const { signedOut } = await action();
      if (signedOut) return await useAccountStore.getState().endSession();
      setConfirming(false);
      load();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(null);
    }
  };

  if (!devices || devices.length === 0) {
    return error ? (
      <SettingsBlock label="Devices" panel="devices">
        <div className="settings-group">
          <SettingRow label="Devices unavailable" hint={error}>
            <button className="btn" onClick={load}>Try again</button>
          </SettingRow>
        </div>
      </SettingsBlock>
    ) : null;
  }
  const warning = logoutConfirmCopy(running);

  return (
    <SettingsBlock label="Devices" panel="devices">
      <div className="settings-group">
        {devices.map((device) => (
          <SettingRow
            key={device.id}
            label={device.name}
            hint={[device.location, lastActive(device.lastActive)].filter(Boolean).join(" · ")}
          >
            {device.current && <StatusChip tone="on">This {computerName}</StatusChip>}
            <button
              className="btn"
              disabled={busy !== null}
              onClick={() => void run(device.id, () => accountDeviceRevoke(device.id))}
            >
              {busy === device.id ? "Signing out…" : "Sign out"}
            </button>
          </SettingRow>
        ))}
        {confirming ? (
          <SettingRow
            label="Sign out everywhere?"
            hint={`This signs out every device, this ${computerName} included.${warning ? ` ${warning}` : ""}`}
            danger
          >
            <button className="btn" disabled={busy !== null} onClick={() => setConfirming(false)}>Cancel</button>
            <button
              className="btn profile-logout"
              disabled={busy !== null}
              onClick={() => void run("all", accountDevicesRevokeAll)}
            >
              {busy === "all" ? "Signing out…" : "Sign out everywhere"}
            </button>
          </SettingRow>
        ) : (
          <SettingRow label="Signed in elsewhere?" hint="Ends every session, including this one.">
            <button className="btn" disabled={busy !== null} onClick={() => setConfirming(true)}>
              Sign out everywhere
            </button>
          </SettingRow>
        )}
        {error && (
          <p className="profile-feedback profile-feedback--row profile-feedback--error" role="status">{error}</p>
        )}
      </div>
    </SettingsBlock>
  );
}
