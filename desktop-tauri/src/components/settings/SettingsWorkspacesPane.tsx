import { useCallback, useEffect, useState } from "react";

import { reviewPruneWorktrees } from "../../ipc/review";
import { workspacesDiskUsage } from "../../ipc/workspaces";
import { formatBytes } from "../../lib/updatePolicy";
import { useSettingsStore } from "../../state/settingsStore";
import { useTerminalStore } from "../../state/terminalStore";
import { SafeWorkspaceRow } from "./SafeWorkspaceRow";
import { pruneSummary, scanWorkspaces, type SafeWorkspaceRow as Row } from "./safeWorkspaces";
import { SettingRow, SettingsBlock } from "./SettingsShared";

/**
 * Settings ▸ Safe workspaces.
 *
 * Safe mode gives every agent pane its own worktree and branch, and nothing in
 * the app managed them: a pane closed with its X leaked both, permanently.
 * Over weeks that is gigabytes on disk and a `git branch` listing that is
 * mostly ours. This pane is where they become visible and removable.
 *
 * There is deliberately no reaper on launch. Everything here deletes work, and
 * a delete the user did not ask for is not housekeeping.
 */
export function SettingsWorkspacesPane() {
  const settings = useSettingsStore((state) => state.settings);
  const panes = useTerminalStore((state) => state.panes);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [size, setSize] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const projects = settings?.projects;
  const scan = useCallback(async () => {
    setRows(await scanWorkspaces(projects ?? [], useTerminalStore.getState().panes));
  }, [projects]);

  useEffect(() => {
    void scan();
  }, [scan, panes.length]);

  // The disk figure is a directory walk, so it is asked for rather than taken:
  // opening Settings must never cost a tour of every checkout on the machine.
  const measure = async () => {
    if (!rows?.length) return;
    setBusy(true);
    try {
      const usage = await workspacesDiskUsage(rows.map((row) => row.path));
      setSize(`${usage.complete ? "" : "at least "}${formatBytes(usage.bytes)}`);
    } catch (failure) {
      setError(String(failure));
    } finally {
      setBusy(false);
    }
  };

  const prune = async () => {
    setBusy(true);
    setError(null);
    try {
      const outcomes: string[] = [];
      for (const project of projects ?? []) {
        outcomes.push(pruneSummary(await reviewPruneWorktrees(project.root)));
      }
      setNote(outcomes.join(" ") || "Nothing to remove.");
      setSize(null);
      await scan();
    } catch (failure) {
      setError(String(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p className="settings-lead">
        Agents launched in safe mode work in a git worktree of their own, on a branch
        under vibyra/. Landing or discarding a review clears one; closing its pane any
        other way leaves it behind, and this is where it shows up.
      </p>

      <SettingsBlock label={rows ? `${rows.length} workspaces` : "Workspaces"}>
        <div className="settings-group">
          {rows === null ? (
            <p className="settings-note">Reading each project&rsquo;s worktrees…</p>
          ) : rows.length === 0 ? (
            <p className="settings-note">
              No safe workspaces. Nothing is being held on disk.
            </p>
          ) : (
            rows.map((row) => (
              <SafeWorkspaceRow
                key={row.path}
                row={row}
                busy={busy}
                onBusy={setBusy}
                onDone={() => void scan()}
                onError={setError}
              />
            ))
          )}
        </div>
      </SettingsBlock>

      <SettingsBlock label="Housekeeping">
        <div className="settings-group">
          <SettingRow
            label="Disk used"
            hint="Every safe workspace, plus the stray patch and snapshot files beside them."
          >
            <div className="settings-row-actions">
              <span className="settings-value">{size ?? "Not measured"}</span>
              <button
                type="button"
                className="btn"
                disabled={busy || !rows?.length}
                onClick={() => void measure()}
              >
                Measure
              </button>
            </div>
          </SettingRow>
          <SettingRow
            label="Remove orphaned workspaces"
            hint="Clears git's record of workspaces whose folder is already gone, deletes the vibyra/ branches left behind that are fully merged into your project, and sweeps stray patch and snapshot files older than an hour. A workspace holding unmerged work is never touched."
          >
            <button type="button" className="btn" disabled={busy} onClick={() => void prune()}>
              {busy ? "Working…" : "Remove"}
            </button>
          </SettingRow>
          {(note || error) && (
            <p className={`settings-note ${error ? "safe-workspace__failure" : ""}`}>
              {error ?? note}
            </p>
          )}
        </div>
      </SettingsBlock>
    </>
  );
}
