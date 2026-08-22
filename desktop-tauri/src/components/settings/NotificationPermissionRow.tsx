import { useEffect, useState } from "react";

import { ensureOsPermission, osPermission, refreshOsPermission, type OsPermission } from "../../lib/osNotifications";
import { SettingRow } from "./SettingsShared";

const HINTS: Record<OsPermission, string> = {
  granted: "Vibyra can raise desktop notifications while its window is in the background.",
  unknown: "Desktop notifications appear outside Vibyra when you are working elsewhere.",
  denied:
    "Your desktop refused the request. Re-enable notifications for Vibyra in your system settings; in-app notifications keep working either way.",
};

/** The grant is only ever requested from this button — prompting at startup,
 * before the user has seen a single notification, is a dark pattern. */
export function NotificationPermissionRow({ disabled }: { disabled: boolean }) {
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
        <span className="integration-status integration-status--success">
          <i aria-hidden="true" />
          Enabled
        </span>
      ) : (
        <button
          className="btn"
          disabled={disabled || busy || state === "denied"}
          onClick={request}
        >
          {state === "denied" ? "Blocked" : "Enable"}
        </button>
      )}
    </SettingRow>
  );
}
