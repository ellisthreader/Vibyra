import { useState } from "react";

import { githubOpenPr, githubPrState, type PrState } from "../../ipc/github";

interface Props {
  worktree: string;
  url: string;
  onClose: () => void;
}

/** The check rollup as a word and a dot, on the shared settings status pill. */
const CHECK_TONE: Record<string, string> = {
  passing: "settings-status--success",
  failing: "settings-status--danger",
  pending: "settings-status--working",
  none: "",
};

const CHECK_LABEL: Record<string, string> = {
  passing: "Checks passing",
  failing: "Checks failing",
  pending: "Checks running",
  none: "No checks",
};

/**
 * What became of the pull request, once it has one.
 *
 * Fetched on the button and never on a timer: `gh` is a process launch per
 * call, and a PR's state changes on the scale of somebody pressing merge. The
 * reading wears no timestamp because it is only ever shown immediately after
 * the fetch that produced it.
 */
export function ReviewPrStatus({ worktree, url, onClose }: Props) {
  const [state, setState] = useState<PrState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      setState(await githubPrState(worktree, url));
    } catch (failure) {
      setError(String(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p className="review-pr__done">
        Pull request opened. <code>{url}</code>
      </p>
      {state && (
        <p className="review-pr__done">
          <span
            className={`settings-status ${state.merged ? "settings-status--success" : "settings-status--warn"}`}
          >
            <i />
            {state.merged ? "Merged" : state.state === "CLOSED" ? "Closed" : "Open"}
          </span>{" "}
          <span className={`settings-status ${CHECK_TONE[state.checks] ?? ""}`}>
            <i />
            {CHECK_LABEL[state.checks] ?? state.checks}
          </span>
        </p>
      )}
      {error && (
        <p className="review-pr__error" role="alert">
          {error}
        </p>
      )}
      <footer className="review-pr__foot">
        <button type="button" className="btn btn--primary" onClick={() => void githubOpenPr(url)}>
          Open on GitHub
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => void check()}>
          {busy ? "Checking…" : state ? "Check again" : "Check status"}
        </button>
        <button type="button" className="btn btn--secondary" onClick={onClose}>
          Done
        </button>
      </footer>
    </>
  );
}
