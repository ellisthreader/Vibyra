import type { VibyraTool } from "./vibyraToolTypes.ts";

// The half of the catalogue that is not about terminals: projects, what can be
// launched, and which part of Vibyra is on screen. Split from `vibyraTools`
// only for the 200-line limit; it is the same API.

const PROJECT = { type: "string", description: "The project's name." };

export const APP_TOOLS: VibyraTool[] = [
  {
    name: "list_projects",
    description: "Every project in Vibyra: name, folder, how many terminals, and which is open.",
    changes: false,
    parameters: { type: "object", properties: {} },
  },
  {
    name: "switch_project",
    description: "Open a different project in the workspace.",
    changes: true,
    parameters: { type: "object", properties: { project: PROJECT }, required: ["project"] },
  },
  {
    name: "add_project",
    description: "Add an existing folder to Vibyra as a project, and open it.",
    changes: true,
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "The folder, e.g. ~/Desktop/Blog or /Users/me/code/app." },
        name: { type: "string", description: "A name, if they gave one. Defaults to the folder's." },
      },
      required: ["path"],
    },
  },
  {
    name: "rename_project",
    description: "Rename a project in Vibyra's list. The folder keeps its name.",
    changes: true,
    parameters: {
      type: "object",
      properties: { project: PROJECT, name: { type: "string", description: "The new name." } },
      required: ["project", "name"],
    },
  },
  {
    name: "remove_project",
    description:
      "Remove a project from Vibyra's list and close its terminals. The folder on disk is not touched. " +
      "Only when they ask to remove, delete or forget a project — to leave one, open home instead.",
    changes: true,
    parameters: { type: "object", properties: { project: PROJECT }, required: ["project"] },
  },
  {
    name: "list_agents",
    description:
      "Which CLI agents are installed and can be launched here, and which models are available " +
      "to them. Use this before claiming something cannot be run.",
    changes: false,
    parameters: { type: "object", properties: {} },
  },
  {
    name: "open_panel",
    description:
      "Show a part of Vibyra: the side panel's preview, worktrees or chat tab; a settings page — any " +
      "'… settings' is panel settings with its section; home (leaves the project); notifications, the " +
      "bell's list of recent alerts; history — saved chats and terminal runs from earlier; the command palette; the new terminal picker; the new " +
      "project page, for starting or creating a project; or a screenshot capture.",
    changes: true,
    parameters: {
      type: "object",
      properties: {
        panel: {
          type: "string",
          enum: ["preview", "worktrees", "chat", "settings", "home", "notifications", "history",
            "command_palette", "new_terminal", "new_project", "screenshot"],
          description: "Which one.",
        },
        section: {
          type: "string",
          enum: ["general", "ai", "notifications", "iphone", "shortcuts", "account", "advanced"],
          description: "For settings only.",
        },
      },
      required: ["panel"],
    },
  },
  {
    name: "close_panel",
    description: "Close settings, saved history, the command palette, notifications, the new terminal picker, or the side panel.",
    changes: true,
    parameters: {
      type: "object",
      properties: {
        panel: { type: "string", enum: ["settings", "history", "command_palette", "notifications", "new_terminal", "side_panel"] },
      },
      required: ["panel"],
    },
  },
  {
    name: "side_panel",
    description: "Resize the right-hand side panel this chat is in: compact, wide, full (full screen) or closed.",
    changes: true,
    parameters: {
      type: "object",
      properties: { size: { type: "string", enum: ["compact", "wide", "full", "closed"] } },
      required: ["size"],
    },
  },
];
