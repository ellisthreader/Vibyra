import { invoke } from "@tauri-apps/api/core";

export interface GithubStatus {
  ghInstalled: boolean;
  authed: boolean;
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
