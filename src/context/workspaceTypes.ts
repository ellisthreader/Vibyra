import { FileEntry, LogEvent, Project } from "../types/domain";
import { makeId } from "../utils/ids";

export type ProjectCreateResult = {
  project: Project;
  projects: Project[];
  files: FileEntry[];
  events: LogEvent[];
};

export type FileCreateResult = {
  file: FileEntry | null;
  files: FileEntry[];
  events: LogEvent[];
};

export function makeLocalProject(nameOverride?: string): Project {
  const timestamp = new Date();
  const name = nameOverride?.trim() || `Untitled Workspace ${timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  const slug = name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "untitled-workspace";

  return {
    id: makeId("project"),
    name,
    path: `~/Desktop/Vibyra Projects/${slug}`,
    stack: "New project",
    updated: "Now",
    source: "mobile"
  };
}
