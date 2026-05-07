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

export function makeLocalProject(): Project {
  const timestamp = new Date();
  const name = `Untitled Workspace ${timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

  return {
    id: makeId("project"),
    name,
    path: "~/Desktop/Vibyra Projects/untitled-workspace",
    stack: "New project",
    updated: "Now",
    source: "mobile"
  };
}
