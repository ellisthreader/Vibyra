import { invoke } from "@tauri-apps/api/core";

import type { ProjectBrief, ProjectSpec } from "../types";

/** What the assistant is told about a project, built natively from the git
 * state, the stack, the open terminals and the project's memory. `query` lets
 * the memory section pick relevant notes; the empty string warms the cache
 * without one. Rust allows itself 5 s for `git status`, so a cold call is slow
 * and a warm one is instant — see `projectStore.activate`. */
export function projectBrief(project: ProjectSpec, query = ""): Promise<ProjectBrief> {
  const { id, name, root } = project;
  return invoke("project_brief", { project: { id, name, root }, query });
}
