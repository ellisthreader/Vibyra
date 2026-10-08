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
import { TERMINAL_REF, VIEW_TOOLS } from "./vibyraViewTools.ts";

export type { VibyraTool };

const AGENTS = ["codex", "claude", "gemini", "aider", "opencode", "qwen", "shell"];

export const VIBYRA_TOOLS: VibyraTool[] = [
  {
    name: "open_terminals",
    description:
      "Open NEW terminals. Only when the person asks to open, launch, start or spin up terminals or " +
      "agents — never to retry a different action. Each runs an AI CLI agent or a plain shell. " +
      "If they name a model (GPT, Claude, Gemini, Astra, Fable…) pass it as `model`; the CLI is chosen for you.",
    changes: true,
    parameters: {
      type: "object",
      properties: {
        agent: { type: "string", enum: AGENTS, description: "Which CLI: codex, claude, gemini… 'shell' is a plain terminal with no AI. Leave out when they named a model." },
        model: { type: "string", description: "Any model they named, in their words — 'gpt astra', 'GPT-6 Astra', 'claude fable 5.1'." },
        count: { type: "integer", minimum: 1, maximum: 8, description: "How many. Defaults to 1." },
        permission: {
          type: "string", enum: ["standard", "full"],
          description: "'full' only when they said full permission(s), full access, auto mode or don't ask.",
        },
        effort: {
          type: "string", enum: ["minimal", "low", "medium", "high", "xhigh", "max"],
          description: "The effort level they said — 'high effort' is high. Leave out if they did not say one.",
        },
        prompt: { type: "string", description: "A first task typed into each new terminal, if they gave one." },
        title: { type: "string", description: "A name for the terminals, if they gave one." },
        project: { type: "string", description: "Project name. Leave out for the open project." },
      },
      required: [],
    },
  },
  {
    name: "list_terminals",
    description:
      "Every open terminal: its id, agent, model, project, whether it is working, idle, waiting for " +
      "input or finished, and the last lines on its screen. Use it for 'what's going on', 'which terminal " +
      "needs me', or to find a terminal by what it is doing.",
    changes: false,
    parameters: {
      type: "object",
      properties: { project: { type: "string", description: "Only this project. Leave out for all of them." } },
    },
  },
  {
    name: "read_terminal",
    description:
      "Read what one terminal is showing now. Use it whenever they ask what a terminal is doing, its " +
      "job or task, whether it finished, what went wrong, or what it is waiting for — then answer from " +
      "what is on screen.",
    changes: false,
    parameters: {
      type: "object",
      properties: {
        terminal: TERMINAL_REF,
        lines: { type: "integer", minimum: 1, maximum: 200, description: "How many lines. Defaults to 60." },
      },
      required: ["terminal"],
    },
  },
  {
    name: "send_to_terminal",
    description:
      "Type into a terminal that is already open: a message or task for the agent in it, a command for a " +
      "shell, and/or one key — 'interrupt' to stop it, 'yes'/'no' to answer a permission prompt, 'enter'. " +
      "\"When it's done\" or \"after that\": send it now; the agent takes it as its next message.",
    changes: true,
    parameters: {
      type: "object",
      properties: {
        terminal: TERMINAL_REF,
        text: { type: "string", description: "Exactly what to type. Return is pressed after it." },
        key: {
          type: "string", enum: ["interrupt", "yes", "no", "enter", "escape", "up", "down", "tab"],
          description: "One key to press before any text.",
        },
      },
      required: ["terminal"],
    },
  },
  {
    name: "close_terminals",
    description:
      "Close terminals. Anything running in them stops. One by `terminal`, every one running an `agent`, " +
      "or with `all` every terminal in a project.",
    changes: true,
    parameters: {
      type: "object",
      properties: {
        terminal: TERMINAL_REF,
        agent: { type: "string", enum: AGENTS, description: "Close every terminal running this CLI in the project." },
        all: { type: "boolean", description: "Close every terminal in the project." },
        project: { type: "string", description: "Which project, with agent or all. Leave out for the open one." },
      },
    },
  },
  ...VIEW_TOOLS,
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
