import { Channel, invoke } from "@tauri-apps/api/core";

import type { ScaffoldEvent, ScaffoldOutcome } from "../ipc/scaffold";
import { teammateApi } from "../components/teammates/api";

/**
 * Putting a finished project on GitHub.
 *
 * Two halves, deliberately: the backend creates an empty repository with the
 * account's connector token, and this computer pushes into it with its own git
 * credentials. A token Vibyra holds may make a repository; it never gains the
 * power to write somebody's source. If this machine has no GitHub credentials
 * the push is what fails, and it says so.
 */
export interface GithubRepository {
  fullName: string;
  htmlUrl: string;
  cloneUrl: string;
  defaultBranch: string;
}

export async function createGithubRepository(name: string, isPrivate: boolean): Promise<GithubRepository> {
  try {
    return await teammateApi<GithubRepository>("connectors/github/repositories", { name, private: isPrivate });
  } catch (error) {
    // A Vibyra Cloud older than this route answers with a routing error about
    // unsupported methods. That is true and useless: say what it means for the
    // person, and what they can do instead.
    if (/\b(404|405)\b/.test(String(error))) {
      throw new Error(
        "Vibyra Cloud cannot create repositories yet. Make the repository on GitHub and push from a terminal, or try again once the server has been updated.",
      );
    }
    throw error;
  }
}

export function githubPublish(
  runId: string,
  dir: string,
  repository: GithubRepository,
  onEvent: (event: ScaffoldEvent) => void,
): Promise<ScaffoldOutcome> {
  const channel = new Channel<ScaffoldEvent>();
  channel.onmessage = onEvent;
  return invoke("github_publish", {
    runId,
    dir,
    remote: repository.cloneUrl,
    branch: repository.defaultBranch,
    onEvent: channel,
  });
}
