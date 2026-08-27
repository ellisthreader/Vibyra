import { useEffect, useState } from "react";

import { mergeWarning, summarize } from "../../lib/reviewPolicy";
import type { ChangedFile, WorktreeStatus } from "../../ipc/review";
import { useGithubIntegrationStore } from "../../state/githubIntegrationStore";
import { useReviewStore } from "../../state/reviewStore";
import { useTerminalStore } from "../../state/terminalStore";
import type { PaneState } from "../../state/terminalStoreTypes";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { GithubIcon } from "../common/Icons";
import { ReviewPrSheet } from "./ReviewPrSheet";

interface Props {
  pane: PaneState;
  projectRoot: string;
  status: WorktreeStatus | null;
  selectedFile: ChangedFile | null;
  onRejected: () => void;
}

/**
 * One clear decision bar: reject the selected safe-workspace file, approve
 * every remaining change into the project, or open the quiet GitHub action.
 * Destructive rejection pauses once with the exact path visible.
 */
export function ReviewActions({ pane, projectRoot, status, selectedFile, onRejected }: Props) {
  const busyPane = useReviewStore((state) => state.busyPane);
  const outcome = useReviewStore((state) => state.outcomeByPane[pane.id]);
  const github = useReviewStore((state) => state.github);
  const merge = useReviewStore((state) => state.merge);
  const rejectFile = useReviewStore((state) => state.rejectFile);
  const integration = useGithubIntegrationStore((state) => state.status);
  const integrationBusy = useGithubIntegrationStore((state) => state.busy);
  const refreshGithubIntegration = useGithubIntegrationStore((state) => state.refresh);
  const openSettingsSection = useWorkspaceStore((state) => state.openSettingsSection);
  const activity = useTerminalStore((state) => state.activity[pane.id] ?? "idle");
  const [confirming, setConfirming] = useState<"approve" | "reject" | null>(null);
  const [prOpen, setPrOpen] = useState(false);

  const busy = busyPane !== null;
  const summary = summarize(status);
  const empty = summary.files === 0;
  const warning = mergeWarning(activity);
  const integrationReady =
    integration?.ghInstalled === true &&
    integration.connected &&
    integration.permissionsReady;
  const repositoryReady = github?.origin != null;
  const integrationHint = integration?.connecting || integrationBusy
    ? "GitHub is connecting — open Integrations to finish setup"
    : !integration?.ghInstalled
      ? "Set up GitHub in Integrations"
      : !integration.connected
        ? "Connect GitHub in Integrations"
        : "Grant the required GitHub permissions in Integrations";
  const repositoryHint = github === null
    ? "Checking this project's GitHub repository"
    : !repositoryReady
      ? "This project has no origin GitHub remote"
      : empty
        ? "There are no changes to open as a pull request"
        : "Push this branch and open a pull request";

  useEffect(() => {
    // One bounded status refresh when Review appears. Connecting follow-up
    // belongs to the Integrations screen; Review never starts a poller.
    void refreshGithubIntegration();
  }, [refreshGithubIntegration]);

  const runMerge = async () => {
    setConfirming(null);
    await merge(pane, projectRoot);
  };

  const runReject = async () => {
    if (!selectedFile) return;
    const rejected = await rejectFile(pane, selectedFile.path);
    if (rejected) onRejected();
    setConfirming(null);
  };

  const runGithubAction = () => {
    if (!integrationReady) {
      openSettingsSection("integrations");
      return;
    }
    if (repositoryReady) setPrOpen(true);
  };

  if (confirming) {
    const approving = confirming === "approve";
    return (
      <footer className="review-actions review-actions--confirm">
        <em>
          {approving
            ? warning
            : <>Reject <code>{selectedFile?.path}</code>? This removes its changes from the safe workspace.</>}
        </em>
        <div className="review-actions__row">
          <button type="button" className="btn" disabled={busy} onClick={() => setConfirming(null)}>
            Keep it
          </button>
          <button
            type="button"
            className={`btn ${approving ? "btn--primary" : "btn--danger"}`}
            disabled={busy}
            onClick={() => void (approving ? runMerge() : runReject())}
          >
            {approving ? "Approve anyway" : "Reject file"}
          </button>
        </div>
      </footer>
    );
  }

  return (
    <footer className="review-actions">
      {outcome && (
        <p className={`review-outcome ${outcome.applied ? "review-outcome--ok" : "review-outcome--stuck"}`}>
          {outcome.applied
            ? "Approved changes are in your project — commit them when you're ready."
            : outcome.conflicts.length > 0
              ? `Not approved — your project has its own changes in: ${outcome.conflicts.join(", ")}. Nothing was touched.`
              : "Nothing to approve yet."}
        </p>
      )}
      <div className="review-actions__row">
        <button
          type="button"
          className="btn"
          disabled={busy || selectedFile === null}
          onClick={() => setConfirming("reject")}
        >
          Reject selected
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={busy || empty}
          onClick={() => void (warning ? setConfirming("approve") : runMerge())}
        >
          {busyPane === pane.id ? "Working…" : "Approve all"}
        </button>
        <div className="review-actions__github-slot">
          {integrationReady && !repositoryReady && (
            <span className="review-actions__github-note">
              {github === null ? "Checking repository…" : "No GitHub remote"}
            </span>
          )}
          <button
            type="button"
            className={`btn review-actions__github ${integrationReady ? "" : "review-actions__github--locked"}`}
            aria-label={integrationReady ? repositoryHint : "Connect GitHub in Integrations"}
            disabled={integrationReady && (busy || empty || !repositoryReady)}
            title={integrationReady ? repositoryHint : integrationHint}
            onClick={runGithubAction}
          >
            <GithubIcon size={17} />
            {!integrationReady && <span className="review-actions__lock" aria-hidden="true" />}
          </button>
        </div>
      </div>
      {prOpen && <ReviewPrSheet pane={pane} status={status} onClose={() => setPrOpen(false)} />}
    </footer>
  );
}
