import { useRef, useState } from "react";

import type { GithubStatus } from "../../ipc/github";
import { writeClipboardText } from "../../ipc/tools";
import { useModalFocus } from "../../lib/useModalFocus";
import { useReviewStore } from "../../state/reviewStore";

interface Props {
  projectRoot: string;
  github: GithubStatus | null;
  onClose: () => void;
}

/**
 * The walk-through behind "Share on GitHub" when the account is not connected
 * yet. The button is never disabled by readiness (Ellis, 2026-08-29): a user
 * who has not set GitHub up gets these steps instead of a dead control.
 *
 * The boundary stays exactly where it was: sign-in happens in GitHub's own
 * `gh` tool, in the user's terminal, and no token ever passes through Vibyra.
 * This sheet only explains, copies the command, and re-checks. The moment the
 * re-check comes back connected, `ReviewActions` swaps this sheet for the real
 * pull-request one — same open state, no extra click.
 */
export function GithubConnectSheet({ projectRoot, github, onClose }: Props) {
  const refreshGithub = useReviewStore((state) => state.refreshGithub);
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  useModalFocus(modalRef, true, onClose);

  const copy = async (text: string) => {
    try {
      await writeClipboardText(text);
      setCopied(text);
    } catch {
      setCopied(null);
    }
  };

  const check = async () => {
    setChecking(true);
    try {
      await refreshGithub(projectRoot);
    } finally {
      setChecking(false);
    }
  };

  const installed = github?.ghInstalled ?? false;
  const authed = installed && (github?.authed ?? false);
  const linked = github?.originGithub ?? false;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal review-connect"
        role="dialog"
        aria-modal="true"
        aria-label="Connect GitHub"
        ref={modalRef}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="review-pr__head">
          <h2>
            {!installed
              ? "Install the GitHub tool first"
              : !authed
                ? "Connect your GitHub account"
                : "This project isn't on GitHub"}
          </h2>
        </header>

        {!installed ? (
          <p className="review-connect__body">
            Sharing goes through GitHub&rsquo;s own command-line tool, <code>gh</code>, so your
            sign-in never touches Vibyra. Install it from <code>cli.github.com</code>, then come
            back here.
          </p>
        ) : !authed ? (
          <>
            <p className="review-connect__body">
              Sign in once with GitHub&rsquo;s own tool and Vibyra can share work for you from then
              on — your password and tokens stay with GitHub, never in Vibyra.
            </p>
            <ol className="review-connect__steps">
              <li>Copy the command below.</li>
              <li>Paste it into any terminal and follow GitHub&rsquo;s prompts.</li>
              <li>Come back and check again.</li>
            </ol>
            <div className="review-connect__command">
              <code>gh auth login</code>
              <button type="button" className="btn" onClick={() => void copy("gh auth login")}>
                {copied === "gh auth login" ? "Copied" : "Copy command"}
              </button>
            </div>
          </>
        ) : (
          <p className="review-connect__body">
            {github?.origin ? (
              <>
                You&rsquo;re signed in, but this project&rsquo;s code lives at{" "}
                <code>{github.origin}</code>, which isn&rsquo;t GitHub — so there is nowhere on
                GitHub to open a pull request against.
              </>
            ) : (
              <>
                You&rsquo;re signed in, but this project isn&rsquo;t linked to a GitHub repository
                yet. Create one on GitHub and connect it (<code>git remote add origin …</code>),
                then check again.
              </>
            )}
          </p>
        )}

        <footer className="review-pr__foot">
          {!linked && (
            <button
              type="button"
              className="btn btn--primary"
              disabled={checking}
              onClick={() => void check()}
            >
              {checking ? "Checking…" : authed ? "Check again" : "I've signed in — check again"}
            </button>
          )}
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}
