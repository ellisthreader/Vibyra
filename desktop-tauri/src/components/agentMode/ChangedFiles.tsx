import { useState } from "react";

import { agentFileDiff } from "../../ipc/agentChats";
import { ReviewDiffView } from "../review/ReviewDiffView";

interface Entry {
  path: string;
  change: string;
}

type Loaded = { state: "loading" } | { state: "ready"; diff: string } | { state: "failed"; why: string };

/**
 * The files a turn changed, each openable into its own diff.
 *
 * The diff is fetched when a row is opened, never with the event. A turn that
 * rewrites forty files would otherwise put forty patches through the channel
 * to show a list nobody expanded, and the patches would be stale by the time
 * anyone did.
 *
 * What it shows is the file's *uncommitted* diff, not a replay of the edit —
 * `file.changed` carries a path and a verb and no before-state, so there is
 * nothing to replay. That is the more useful answer anyway: what is different
 * now, which is what a person is deciding whether to keep. The heading says so
 * rather than letting the reader assume it is turn-scoped.
 */
export function ChangedFiles({
  entries,
  agentId,
}: {
  entries: Entry[];
  agentId: string | null;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [diffs, setDiffs] = useState<Record<string, Loaded>>({});

  const toggle = async (path: string) => {
    if (open === path) {
      setOpen(null);
      return;
    }
    setOpen(path);
    if (diffs[path]?.state === "ready") return;
    setDiffs((current) => ({ ...current, [path]: { state: "loading" } }));
    try {
      const diff = await agentFileDiff(agentId, path);
      setDiffs((current) => ({ ...current, [path]: { state: "ready", diff } }));
    } catch (error) {
      setDiffs((current) => ({ ...current, [path]: { state: "failed", why: String(error) } }));
    }
  };

  return (
    <div className="changed">
      <p className="changed__head">
        {entries.length === 1 ? "1 file changed" : `${entries.length} files changed`}
        <span> · showing what is not yet committed</span>
      </p>
      <ul className="changed__list">
        {entries.map((entry) => {
          const loaded = diffs[entry.path];
          const isOpen = open === entry.path;
          return (
            <li key={`${entry.path}-${entry.change}`}>
              <button
                type="button"
                className={`changed__row ${isOpen ? "is-open" : ""}`}
                aria-expanded={isOpen}
                onClick={() => void toggle(entry.path)}
              >
                <span className={`changed__kind changed__kind--${entry.change}`}>
                  {entry.change}
                </span>
                <code className="changed__path" title={entry.path}>
                  {entry.path}
                </code>
                <span className="changed__chevron" aria-hidden="true">
                  {isOpen ? "−" : "+"}
                </span>
              </button>
              {isOpen && (
                <div className="changed__diff">
                  {!loaded || loaded.state === "loading" ? (
                    <p className="changed__quiet">Reading the diff…</p>
                  ) : loaded.state === "failed" ? (
                    <p className="changed__quiet changed__quiet--bad">{loaded.why}</p>
                  ) : loaded.diff.trim() ? (
                    <ReviewDiffView diff={loaded.diff} />
                  ) : (
                    <p className="changed__quiet">
                      Nothing uncommitted here — this file matches its last commit.
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
