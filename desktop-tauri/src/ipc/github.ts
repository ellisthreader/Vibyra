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
 */
export function githubCreatePr(worktree: string, title: string, body: string): Promise<string> {
  return invoke("github_create_pr", { worktree, title, body, base: null });
}

export function githubOpenPr(url: string): Promise<void> {
  return invoke("github_open_pr", { url });
}
