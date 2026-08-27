import { invoke } from "@tauri-apps/api/core";

export interface GithubStatus {
  /** The `origin` remote's URL, when the repo has one to push to. */
  origin: string | null;
}

export function githubStatus(projectRoot: string): Promise<GithubStatus> {
  return invoke("github_status", { projectRoot });
}

/**
 * Commits the worktree's pending work, pushes its branch, and opens a PR —
 * returning gh's own link. The commit step is native so the PR always
 * carries the work being reviewed, not just the launch snapshot.
 */
export function githubCreatePr(worktree: string, title: string, body: string): Promise<string> {
  return invoke("github_create_pr", { worktree, title, body, base: null });
}

export function githubOpenPr(url: string): Promise<void> {
  return invoke("github_open_pr", { url });
}

export interface GithubIntegrationStatus {
  ghInstalled: boolean;
  connected: boolean;
  connecting: boolean;
  login: string | null;
  permissionsReady: boolean;
  error: string | null;
}

export function githubIntegrationStatus(): Promise<GithubIntegrationStatus> {
  return invoke("github_integration_status");
}

export function githubConnect(): Promise<GithubIntegrationStatus> {
  return invoke("github_connect");
}

export function githubCancelConnect(): Promise<GithubIntegrationStatus> {
  return invoke("github_cancel_connect");
}

export function githubDisconnect(): Promise<GithubIntegrationStatus> {
  return invoke("github_disconnect");
}

export function githubOpenInstall(): Promise<void> {
  return invoke("github_open_install");
}
