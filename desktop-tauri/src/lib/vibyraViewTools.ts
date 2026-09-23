import type { VibyraTool } from "./vibyraToolTypes.ts";

// Tools for a terminal that is already open: bring it forward, make it fill
// the workspace, rename it, start it again. Split from `vibyraTools` for the
// 200-line limit; it is the same API.

/** How a tool names one terminal. Loose on purpose — the runner resolves an
 * id, "#4", "chat-1", or an agent or name ("claude", "the codex one"). */
export const TERMINAL_REF = {
  type: ["string", "integer"],
  description: "Which terminal: its id in quotes from the workspace list (\"1\", \"3f9c2a71\"), or the word they used for it " +
    "(\"claude\", \"codex\", \"claude in HKE\") — Vibyra picks the match, preferring the open project.",
};

export const VIEW_TOOLS: VibyraTool[] = [
  {
    name: "fullscreen_terminal",
    description:
      "Make a terminal fill the workspace — full screen, maximise, enlarge, zoom, make it bigger. " +
      "Safe to repeat. With on=false, leave full screen and show every terminal again.",
    changes: true,
    parameters: {
      type: "object",
      properties: {
        terminal: TERMINAL_REF,
        on: { type: "boolean", description: "false to leave full screen. Defaults to true." },
      },
    },
  },
  {
    name: "focus_terminal",
    description: "Bring one terminal to the front and give it the keyboard — 'go to', 'switch to', 'show me' a terminal. Opens its project if needed.",
    changes: true,
    parameters: { type: "object", properties: { terminal: TERMINAL_REF }, required: ["terminal"] },
  },
  {
    name: "rename_terminal",
    description: "Give a terminal a new name in the grid.",
    changes: true,
    parameters: {
      type: "object",
      properties: { terminal: TERMINAL_REF, title: { type: "string", description: "The new name." } },
      required: ["terminal", "title"],
    },
  },
  {
    name: "restart_terminal",
    description: "Start a finished terminal again, or resume one saved from an earlier run.",
    changes: true,
    parameters: { type: "object", properties: { terminal: TERMINAL_REF }, required: ["terminal"] },
  },
];
