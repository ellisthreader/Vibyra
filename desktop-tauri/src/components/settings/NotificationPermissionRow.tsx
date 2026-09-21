import { useEffect, useState } from "react";

import { ensureOsPermission, osPermission, refreshOsPermission, type OsPermission } from "../../lib/osNotifications";
import { StatusChip } from "./SettingsControls";
import { SettingRow, Switch } from "./SettingsShared";

const HINTS: Record<OsPermission, string> = {
  granted: "System banners while Vibyra is in the background.",
  unknown: "System banners while Vibyra is in the background. Your desktop will ask once.",
  denied: "Your desktop refused. Re-enable notifications for Vibyra in System Settings; in-app notifications keep working.",
};

/** The grant is only ever requested from this row — prompting at startup,
 * before the user has seen a single notification, is a dark pattern. The
 * switch is the preference; the chip is what the operating system says. */
export function NotificationPermissionRow({
  disabled,
  enabled,
  onToggle,
}: {
  disabled: boolean;
  enabled: boolean;
  onToggle: (next: boolean) => void;
}) {
  const [state, setState] = useState<OsPermission>(osPermission);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void refreshOsPermission().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const request = () => {
    setBusy(true);
    void ensureOsPermission()
      .then(() => setState(osPermission()))
      .finally(() => setBusy(false));
  };

  return (
    <SettingRow label="Desktop notifications" hint={HINTS[state]}>
      {state === "granted" ? (
        enabled && !disabled ? <StatusChip tone="on">Allowed</StatusChip> : null
      ) : state === "denied" ? (
        <StatusChip tone="warn">Blocked</StatusChip>
      ) : (
        <button className="btn" disabled={disabled || busy} onClick={request}>Allow</button>
      )}
      <Switch checked={enabled} disabled={disabled || state === "denied"} label="Desktop notifications" onChange={onToggle} />
    </SettingRow>
  );
}
