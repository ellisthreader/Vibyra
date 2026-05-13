import { ChatMessage, FileEntry, Project } from "../types/domain";

export const emptyProject: Project = {
  id: "no-project",
  name: "No project selected",
  path: "Connect Vibyra Desktop or create a project",
  stack: "",
  updated: ""
};

export const emptyFile: FileEntry = {
  id: "empty",
  name: "No files",
  path: "No files loaded",
  language: "txt",
  changed: "clean",
  body: "Select a project with readable files."
};

export const emptyChatMessages: ChatMessage[] = [];
