import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";

import {
  formatCheckedAt,
  updateSummary,
  type CheckAction,
} from "../../lib/updateCheckPolicy";
import { useUpdateStore } from "../../state/updateStore";
import { SettingRow, SettingsBlock } from "./SettingsShared";

function runAction(kind: CheckAction): void {
  const store = useUpdateStore.getState();
  if (kind === "restart") void store.restart();
  else if (kind === "download") void store.download();
  else void store.check();
}

/**
 * The manual half of the updater. The banner and titlebar chip only ever
 * appear when there is something to install, which leaves a healthy app
 * indistinguishable from one whose release feed is quietly failing — this pane
 * is where the version, the last check and any failure are always readable,
 * and where a check can be forced instead of waiting for the 20-minute tick.
 */
export function SettingsUpdatesPane() {
  const status = useUpdateStore((state) => state.status);
  const checkState = useUpdateStore((state) => state.checkState);
  const version = useUpdateStore((state) => state.version);
  const progress = useUpdateStore((state) => state.progress);
  const error = useUpdateStore((state) => state.error);
  const checkError = useUpdateStore((state) => state.checkError);
  const lastCheckedAt = useUpdateStore((state) => state.lastCheckedAt);
  const [installed, setInstalled] = useState("");

  useEffect(() => {
    let cancelled = false;
    void getVersion()
      .then((next) => {
        if (!cancelled) setInstalled(next);
      })
      .catch(() => {
        if (!cancelled) setInstalled("");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Opening this pane before the watcher's first tick would otherwise show
  // "no check yet" with no way to know that is normal. One check on arrival
  // only fires in that window, since every later visit is already `done`.
  useEffect(() => {
    if (useUpdateStore.getState().checkState === "idle") {
      void useUpdateStore.getState().check();
    }
  }, []);

  const summary = updateSummary({ status, checkState, version, progress, error, checkError });
  const action = summary.action;

  return (
    <>
      <SettingsBlock label="Status">
        <div className="settings-group">
          <div
            className={`vupdate-panel vupdate-panel--${summary.tone}`}
            role="status"
            aria-live="polite"
          >
            <span className="vupdate-panel__dot" aria-hidden="true" />
            <div className="vupdate-panel__text">
              <h3 className="vupdate-panel__headline">{summary.headline}</h3>
              <p className="vupdate-panel__detail">{summary.detail}</p>
            </div>
            {action ? (
              <button
                type="button"
                className="btn btn--primary vupdate-panel__action"
                onClick={() => runAction(action.kind)}
                disabled={action.busy}
              >
                {action.label}
              </button>
            ) : null}
          </div>
          <SettingRow
            label="Installed version"
            hint={formatCheckedAt(lastCheckedAt, Date.now())}
          >
            <span className="vupdate-panel__version">
              {installed ? `Vibyra ${installed}` : "Unknown"}
            </span>
          </SettingRow>
        </div>
      </SettingsBlock>
      <SettingsBlock label="How updating works">
        <div className="settings-group">
          <p className="settings-note vupdate-panel__note">
            Vibyra checks for a new release shortly after launch and every 20 minutes
            after that. When one is found it announces itself once, and stays reachable
            from the titlebar and from here until you install it.
          </p>
          <p className="settings-note vupdate-panel__note">
            Downloading and restarting are separate steps on purpose. This window holds
            live terminal sessions, so nothing is swapped out until you choose to restart —
            and your open terminals and layout are saved first.
          </p>
        </div>
      </SettingsBlock>
    </>
  );
}
