import { invoke } from "@tauri-apps/api/core";

export interface ActivityCounts {
  additions: number;
  deletions: number;
  changedFiles: number;
  commits: number;
  binaryFiles: number;
}

export interface ActivityDay extends ActivityCounts {
  date: string;
}

export interface ProjectActivity {
  isGit: boolean;
  days: ActivityDay[];
  workingTree: ActivityCounts;
  truncated: boolean;
}

export function readProjectActivity(projectRoot: string): Promise<ProjectActivity> {
  return invoke("project_activity", { projectRoot });
}
