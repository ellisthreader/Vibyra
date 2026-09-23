import type { VibyraTool } from "./vibyraToolTypes.ts";

// The half of the catalogue that is not about terminals: projects, what can be
// launched, and which part of Vibyra is on screen. Split from `vibyraTools`
// only for the 200-line limit; it is the same API.

export const APP_TOOLS: VibyraTool[] = [
  {
    name: "list_projects",
    description: "Every project Vibyra knows about, which one is open, and where each lives.",
    changes: false,
    parameters: { type: "object", properties: {} },
  },
  {
    name: "switch_project",
    description: "Open a different project in the workspace.",
    changes: true,
    parameters: {
      type: "object",
      properties: { project: { type: "string", description: "Its name." } },
      required: ["project"],
    },
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
    description: "Show a part of Vibyra: the preview, the worktrees, the chat, or a settings page.",
    changes: true,
    parameters: {
      type: "object",
      properties: {
        panel: {
          type: "string",
          enum: ["preview", "worktrees", "chat", "settings", "home"],
          description: "Which surface to open.",
        },
        section: {
          type: "string",
          description: "For settings only: general, ai, notifications, iphone, shortcuts, account or advanced.",
        },
      },
      required: ["panel"],
    },
  },
];
