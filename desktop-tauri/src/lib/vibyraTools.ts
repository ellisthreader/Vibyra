// The Vibyra AI's API: what the workspace assistant is allowed to do to the
// application, as data. Kept separate from the code that performs each one, so
// the contract can be read, tested and sent to a model without dragging the
// stores in behind it.
//
// The line these draw is deliberate. Vibyra's assistant runs the *app* — open
// terminals, say what they are doing, move between projects. It does not read
// or write the codebase: that is what the agents inside the terminals are for,
// and two things editing the same folder is how work gets lost.

import type { VibyraTool } from "./vibyraToolTypes.ts";
import { APP_TOOLS } from "./vibyraAppTools.ts";

export type { VibyraTool };

const AGENTS = ["codex", "claude", "gemini", "aider", "opencode", "qwen", "shell"];

export const VIBYRA_TOOLS: VibyraTool[] = [
  {
    name: "open_terminals",
    description:
      "Open one or more terminals in a project, each running an AI CLI agent or a plain shell. " +
      "Use this whenever the person asks to open, start or spin up terminals or agents. " +
      "If they name a model (GPT, Claude, Gemini, Astra, Sol…), pass it as `model` and leave " +
      "`agent` out — the matching CLI is chosen for you. Only pass agent 'shell' when they " +
      "explicitly want a plain terminal with no AI in it.",
    changes: true,
    parameters: {
      type: "object",
      properties: {
        agent: {
          type: "string",
          enum: AGENTS,
          description: "Which CLI to run. Omit when a model is named. 'shell' is a plain terminal.",
        },
        model: {
          type: "string",
          description:
            "The model, as the person said it — 'GPT-6 Astra', 'gptastra', 'Claude Fable'. " +
            "Pass their words; Vibyra matches them to the real name.",
        },
        count: { type: "integer", minimum: 1, maximum: 8, description: "How many to open. Defaults to 1." },
        permission: {
          type: "string",
          enum: ["standard", "full"],
          description:
            "'full' lets the agent act without asking each time. Only when they say so — " +
            "'full permissions', 'auto mode', 'don't ask me'.",
        },
        effort: {
          type: "string",
          description:
            "Reasoning effort for models that take one: minimal, low, medium or high. " +
            "Pass only what they asked for.",
        },
        prompt: {
          type: "string",
          description:
            "A first message typed into each terminal once it starts, for 'open three Codex " +
            "terminals and tell them to review the auth flow'.",
        },
        title: { type: "string", description: "A name for the terminals, if they gave one." },
        project: { type: "string", description: "Project name. Defaults to the one that is open." },
      },
      required: [],
    },
  },
  {
    name: "list_terminals",
    description:
      "What is open right now: every terminal, which agent it runs, which project it belongs to, " +
      "whether it is working, waiting or finished, and what it is called. Use this to answer " +
      "anything about what is going on.",
    changes: false,
    parameters: {
      type: "object",
      properties: {
        project: { type: "string", description: "Only this project. Defaults to all of them." },
      },
    },
  },
  {
    name: "read_terminal",
    description:
      "The most recent output of one terminal, so you can say what it is doing or what went wrong. " +
      "Read it before answering a question about a specific terminal.",
    changes: false,
    parameters: {
      type: "object",
      properties: {
        terminal: { type: "integer", description: "The id from list_terminals." },
        lines: { type: "integer", minimum: 1, maximum: 200, description: "How many lines. Defaults to 40." },
      },
      required: ["terminal"],
    },
  },
  {
    name: "close_terminals",
    description:
      "Close one terminal, or every terminal matching a project or an agent. Anything running " +
      "inside them stops. Use list_terminals first if you are not sure which they mean.",
    changes: true,
    parameters: {
      type: "object",
      properties: {
        terminal: { type: "integer", description: "One id from list_terminals." },
        agent: { type: "string", enum: AGENTS, description: "Close every terminal running this CLI." },
        project: { type: "string", description: "Close every terminal in this project." },
      },
    },
  },
  {
    name: "send_to_terminal",
    description:
      "Type a message into a running terminal and press return — a prompt for the agent in it, " +
      "or a line for a shell. Use it when they want something said to a terminal that is " +
      "already open.",
    changes: true,
    parameters: {
      type: "object",
      properties: {
        terminal: { type: "integer", description: "The id from list_terminals." },
        text: { type: "string", description: "Exactly what to type." },
      },
      required: ["terminal", "text"],
    },
  },
  {
    name: "focus_terminal",
    description: "Bring one terminal to the front and give it the keyboard.",
    changes: true,
    parameters: {
      type: "object",
      properties: { terminal: { type: "integer", description: "The id from list_terminals." } },
      required: ["terminal"],
    },
  },
  ...APP_TOOLS,
];

/** The catalogue in the shape the chat request wants it. */
export function toolSchemas(): Record<string, unknown>[] {
  return VIBYRA_TOOLS.map((tool) => ({
    type: "function",
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  }));
}

export function findTool(name: string): VibyraTool | undefined {
  return VIBYRA_TOOLS.find((tool) => tool.name === name);
}

/** A model can send malformed JSON, and a thrown parse error inside the reply
 * loop would lose the whole turn. An unreadable call is a failed tool, not a
 * failed conversation. */
export function parseArguments(raw: string): Record<string, unknown> | null {
  if (!raw.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
