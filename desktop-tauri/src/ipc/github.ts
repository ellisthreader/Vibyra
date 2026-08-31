import { invoke } from "@tauri-apps/api/core";

export interface GithubStatus {
  ghInstalled: boolean;
  authed: boolean;
  /** The `origin` remote's URL, when the repo has one to push to. */
  origin: string | null;
  /**
   * Whether that remote lives on github.com. A GitLab or self-hosted origin
   * can be pushed to, but `gh pr create` would fail after the push — so
   * sharing needs this, not just a non-empty `origin`.
   */
  originGithub: boolean;
}

export function githubStatus(projectRoot: string): Promise<GithubStatus> {
  return invoke("github_status", { projectRoot });
}

/**
 * Commits the worktree's pending work, pushes its branch, and opens a PR —
 * returning gh's own link. The commit step is native so the PR always
 * carries the work being reviewed, not just the launch snapshot.
 *
 * `base` is the branch the PR targets. Passing `null` keeps gh's own choice
 * of the repository default, which is the wrong target the moment the agent
 * was launched from a feature branch — so the sheet always sends a choice.
 */
export function githubCreatePr(
  worktree: string,
  title: string,
  body: string,
  base: string | null = null,
): Promise<string> {
  return invoke("github_create_pr", { worktree, title, body, base });
}

export interface RepoBranches {
  /** What gh would have targeted on its own; the picker opens on it. */
  defaultBranch: string | null;
  names: string[];
  /** True when the repo has more branches than one page holds. */
  truncated: boolean;
}

/** The branches a pull request could target. One fetch per sheet, no polling. */
export function githubListBranches(worktree: string): Promise<RepoBranches> {
  return invoke("github_list_branches", { worktree });
}

export interface PrState {
  /** `OPEN`, `MERGED` or `CLOSED`, as GitHub reports it. */
  state: string;
  merged: boolean;
  /** `none`, `pending`, `passing` or `failing`, graded pessimistically. */
  checks: string;
}

/**
 * What became of a pull request. On demand only: a poll over every open
 * workspace would burn the user's API budget re-learning an answer nobody is
 * looking at, and each call is a `gh` process launch.
 */
export function githubPrState(worktree: string, url: string): Promise<PrState> {
  return invoke("github_pr_state", { worktree, url });
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
