import { useEffect, useState } from "react";

import { githubOpenInstall } from "../../ipc/github";
import { useGithubIntegrationStore } from "../../state/githubIntegrationStore";
import { GithubIcon } from "../common/Icons";

const ACCESS_COPY = (
  <p className="github-integration__access">
    Before connecting, Vibyra asks GitHub CLI for access to public and private repositories,
    pull requests, Actions workflow files, and gists. It does not request organization-admin or
    repository-deletion access. Credentials stay in the official GitHub CLI.
  </p>
);

export function GithubIntegrationCard() {
  const status = useGithubIntegrationStore((state) => state.status);
  const busy = useGithubIntegrationStore((state) => state.busy);
  const error = useGithubIntegrationStore((state) => state.error);
  const refresh = useGithubIntegrationStore((state) => state.refresh);
  const connect = useGithubIntegrationStore((state) => state.connect);
  const cancel = useGithubIntegrationStore((state) => state.cancel);
  const disconnect = useGithubIntegrationStore((state) => state.disconnect);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!status?.connecting) return;
    const timer = window.setInterval(() => void refresh(), 1_800);
    return () => window.clearInterval(timer);
  }, [refresh, status?.connecting]);

  useEffect(() => {
    if (status && !status.connected) setConfirmingDisconnect(false);
  }, [status]);

  const heading = (
    <div className="github-integration__identity">
      <span className="github-integration__mark" aria-hidden="true"><GithubIcon size={22} /></span>
      <span><strong>GitHub</strong><small>Pull requests and Actions</small></span>
    </div>
  );

  if (error) {
    const retrySetup = status?.ghInstalled && !status.permissionsReady;
    return (
      <article className="settings-group github-integration">
        <div className="github-integration__row">{heading}<Status tone="danger" label="Failed" /></div>
        <p className="github-integration__error" role="alert">{error}</p>
        <button
          type="button"
          className="btn btn--secondary"
          disabled={busy}
          onClick={() => void (retrySetup ? connect() : refresh())}
        >
          {retrySetup ? "Try setup again" : "Check again"}
        </button>
      </article>
    );
  }

  if (!status) {
    return (
      <article className="settings-group github-integration" aria-busy="true">
        <div className="github-integration__row">{heading}<Status tone="working" label="Checking" /></div>
        <p className="github-integration__copy">Checking GitHub CLI and account access…</p>
      </article>
    );
  }

  if (!status.ghInstalled) {
    return (
      <article className="settings-group github-integration">
        <div className="github-integration__row">{heading}<Status tone="neutral" label="CLI required" /></div>
        <p className="github-integration__copy">Install the official GitHub CLI, then check again.</p>
        <div className="github-integration__actions">
          <button type="button" className="btn btn--primary" onClick={() => void githubOpenInstall()}>Install GitHub CLI</button>
          <button type="button" className="btn btn--secondary" disabled={busy} onClick={() => void refresh()}>Check again</button>
        </div>
      </article>
    );
  }

  if (status.connecting) {
    return (
      <article className="settings-group github-integration" aria-busy="true">
        <div className="github-integration__row">{heading}<Status tone="working" label="Authorizing" /></div>
        <p className="github-integration__copy">GitHub is opening in your browser. Paste the copied one-time code to continue.</p>
        <button type="button" className="btn btn--secondary" disabled={busy} onClick={() => void cancel()}>Cancel</button>
      </article>
    );
  }

  if (!status.connected || !status.permissionsReady) {
    return (
      <article className="settings-group github-integration">
        <div className="github-integration__row">
          {heading}
          <Status tone="neutral" label={status.connected ? "Access incomplete" : "Not connected"} />
        </div>
        {status.connected ? <p className="github-integration__copy">Reconnect to finish granting the required repository access.</p> : null}
        {ACCESS_COPY}
        <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void connect()}>
          {busy ? "Starting…" : status.connected ? "Finish setup" : "Connect GitHub"}
        </button>
      </article>
    );
  }

  return (
    <article className="settings-group github-integration">
      <div className="github-integration__row">{heading}<Status tone="success" label="Connected" /></div>
      <p className="github-integration__copy">Signed in as <strong>{status.login ? `@${status.login}` : "your GitHub account"}</strong>. Repository, pull request, Actions, and gist access is ready.</p>
      {confirmingDisconnect ? (
        <div className="github-integration__confirm">
          <p>Disconnect GitHub? This removes the local GitHub CLI authorization from this computer, but GitHub does not revoke the token. Revoke GitHub CLI in GitHub settings to invalidate its tokens everywhere. Vibyra stores no credentials.</p>
          <span><button type="button" className="btn btn--secondary" onClick={() => setConfirmingDisconnect(false)}>Keep connected</button><button type="button" className="btn btn--danger" disabled={busy} onClick={() => void disconnect()}>Disconnect</button></span>
        </div>
      ) : (
        <button type="button" className="btn btn--secondary" onClick={() => setConfirmingDisconnect(true)}>Disconnect</button>
      )}
    </article>
  );
}

function Status({ tone, label }: { tone: "danger" | "neutral" | "success" | "working"; label: string }) {
  return <span className={`settings-status settings-status--${tone}`}><i aria-hidden="true" />{label}</span>;
}
