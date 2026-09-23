import { useEffect, useRef, useState } from "react";

import { ensureOsPermission, osPermission, refreshOsPermission, type OsPermission } from "../../lib/osNotifications";
import { StatusChip } from "./SettingsControls";
import { SettingRow, Switch } from "./SettingsShared";

const HINTS: Record<OsPermission, string> = {
  granted: "System banners outside the Vibyra window.",
  unknown: "System banners outside the Vibyra window. Your desktop will ask once.",
  denied: "Your desktop refused. Allow Vibyra in System Settings; in-app notifications keep working.",
};

/** The grant is only ever requested from this row — prompting at startup,
 * before the user has seen a single notification, is a dark pattern. The
 * switch is the preference; the chip is what the operating system says.
 *
 * `osOnlyWhenAway` deliberately has no control here any more. It is still
 * persisted and `notificationPolicy.ts` still honours it; the owner asked for
 * the qualifier row to go, and its default — banner only while Vibyra is in
 * the background — is the behaviour almost everyone wants. */
export function NotificationPermissionRow({
  disabled,
  enabled,
  onToggle,
}: {
  disabled: boolean;
  enabled: boolean;
  onToggle: (next: boolean) => void;
}) {
  const [state, setState] = useState<OsPermission>(() => osPermission());
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

  // The OS prompt can outlive this row — closing Settings while it is up must
  // not land on an unmounted component, the same guard the read above uses.
  const live = useRef(true);
  useEffect(() => () => { live.current = false; }, []);

  const request = () => {
    setBusy(true);
    void ensureOsPermission()
      .then(() => live.current && setState(osPermission()))
      .finally(() => { if (live.current) setBusy(false); });
  };

  return (
    <SettingRow dim={disabled} label="Desktop notifications" hint={HINTS[state]}>
      {state === "granted" ? null : state === "denied" ? (
        <StatusChip tone="warn">Blocked</StatusChip>
      ) : (
        /* The one action that unlocks this section; it should not be the
           quietest button on the page. */
        <button className="btn btn--primary" disabled={disabled || busy} onClick={request}>Allow</button>
      )}
      {/* No switch while the desktop is refusing: a disabled control still
          showing its "on" track next to a Blocked chip states the opposite
          of the chip. The chip and the hint are the whole story here. */}
      {state !== "denied" && (
        <Switch checked={enabled} disabled={disabled} label="Desktop notifications" onChange={onToggle} />
      )}
    </SettingRow>
  );
}
