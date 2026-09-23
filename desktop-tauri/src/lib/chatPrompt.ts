import { computerName } from "./platform.ts";
import type { ProjectBrief } from "../types";

// The whole system prompt, in one pure function. Two budgets hold it in place:
// the brief is clamped before it is spliced in, and the static text around it
// has to fit in what is left. `chatBudget.test.mjs` checks both against the
// Rust ceilings, because every char here comes out of the conversation.

/** Ceiling for the assembled prompt. The Rust clamp allows 8,000 per message,
 * and the brief takes 3,200 of that, so this is the rest of the room. It grew
 * when the assistant gained tools: it now has to be told what it can do. */
export const MAX_SYSTEM_CHARS = 4_800;
/** Ceiling for the project brief inside it — `brief::budget::TOTAL_CHARS`. */
export const MAX_BRIEF_CHARS = 3_200;

const PERSONA =
  `You are Vibyra's workspace assistant. You run Vibyra itself on this person's own ${computerName}: you ` +
  "open terminals, say what they are doing, read one, close one, move between projects and " +
  "open panels — with the tools you have been given. Use a tool rather than describing how to " +
  "do the thing yourself, and never say you cannot open a terminal or see what is running.\n" +
  "You do not read or edit the codebase. The AI agents inside the terminals do that work, and " +
  "two things editing one folder loses work. If they want a file changed, open a terminal with " +
  "an agent in it and say so.\n" +
  "The brief below is all you know about the project without a tool. If it does not say, use a " +
  "tool or say plainly that you cannot see it.";

/** Short, plain and finished. Both styles get it: the written one is read in a
 * 380px sidebar and the spoken one is heard, and neither has room for a model
 * clearing its throat. Kept terse — a long instruction to be brief argues
 * against itself, and every character here comes out of the brief. */
const BREVITY =
  "\nAnswer in as few words as the question needs, usually one to three sentences. Lead with " +
  "the answer. No pleasantries, no restating the question, no offering to help: they have " +
  "already asked. Say what you can do, not what you cannot, and say it once.";

const WRITTEN_STYLE =
  "\nYour reply is markdown. Keep lists short and use `inline code` for paths, commands and " +
  "identifiers. A table only for three or more things across three or more columns. Never " +
  "open with a heading.\n" +
  "Put every shell command in a fence of its own, tagged bash:\n" +
  "```bash\nnpm run build\n```\n" +
  "One command per fence, no $ prefix, no comments or expected output inside it, and never " +
  "cd into the project root. Each fence gets a Run button that runs it in a terminal already " +
  "open there, so write commands that are safe to run exactly as they stand.";

/** Moved verbatim from the old `chatStore`: `verify-chat-voice.mjs` asserts a
 * spoken turn asks for this and a typed one never does. */
const SPOKEN_STYLE =
  "\nThis reply will be spoken aloud. Answer in one to three short spoken sentences. " +
  "Use plain words a person can follow by ear. No markdown, no lists, no code blocks, no file paths " +
  "unless they were asked for. If the answer is long, give the one sentence that matters and offer to go on.";

/** What stands in for the brief when the person has switched project context
 * off. Said plainly, because the alternative is a model guessing in a voice
 * that sounds informed. */
export const CONTEXT_OFF: ProjectBrief = {
  text:
    "Project context is switched off in Settings, so the name and folder above are all you " +
    "have. Do not describe this project's contents, and say plainly that context is off if " +
    "you are asked something it would have answered.",
  shape: "plain",
  codebase: false,
  chars: 0,
  truncated: [],
};

const BLIND =
  "\nVibyra could not read this folder just now, so you are working blind. Say that rather " +
  "than guessing at its contents.";

function clampBrief(text: string, room: number): string {
  const limit = Math.min(MAX_BRIEF_CHARS, room);
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(limit - 24, 0)).trimEnd()}\n…[trimmed by Vibyra]`;
}

/** The system message for one turn. Written and spoken styles replace each
 * other — appending both would tell the model to use markdown and not to. */
export function systemPrompt(
  brief: ProjectBrief | null,
  project: { name: string; root: string } | null,
  spoken: boolean,
): string {
  const head = project ? `${PERSONA}\n\nProject: ${project.name} at ${project.root}` : PERSONA;
  const style = `${BREVITY}${spoken ? SPOKEN_STYLE : WRITTEN_STYLE}`;
  // The brief is what gives way when a long project path eats the budget:
  // trimming the rules would leave the model following half of them.
  const room = MAX_SYSTEM_CHARS - head.length - style.length - 2;
  const body = brief ? `\n${clampBrief(brief.text, room)}` : BLIND;
  return `${head}\n${body}\n${style}`;
}
