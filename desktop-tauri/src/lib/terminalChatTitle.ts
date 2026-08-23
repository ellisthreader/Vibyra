const MAX_PROMPT_CHARS = 4_000;
const MAX_TITLE_CHARS = 64;
const MAX_TITLE_WORDS = 9;

const NATIVE_CHAT_TITLE_AGENTS = new Set(["claude"]);
const NON_CHAT_AGENTS = new Set(["shell", "ssh"]);
const UTILITY_COMMAND = /^\/(?:clear|exit|help|login|logout|model|quit|resume|settings|status|theme)\b/i;
const SHORT_REPLY = /^(?:[yn]|yes|no|ok|okay|allow|deny|always allow|trust|cancel|continue)$/i;

/** Claude supplies its own chat-aware OSC title; shells are not AI chats. */
export function needsPromptDerivedTitle(agentId: string): boolean {
  return !NATIVE_CHAT_TITLE_AGENTS.has(agentId) && !NON_CHAT_AGENTS.has(agentId);
}

/** A compact, local-only title from the first real prompt sent to an AI CLI. */
export function titleFromPrompt(raw: string): string | null {
  let prompt = raw
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, " ")
    .replace(/```[\s\S]*?```/g, " code ")
    .replace(/https?:\/\/\S+/gi, " linked page ")
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, " account ")
    .replace(/\b(?:sk-|gh[pousr]_|xox[baprs]-)[A-Za-z0-9_-]{8,}\b/g, " credential ")
    .replace(/\b[A-Za-z0-9_=-]{28,}\b/g, " value ")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/^\s*(?:[#>*-]+|\d+[.)])\s*/, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!prompt || UTILITY_COMMAND.test(prompt) || SHORT_REPLY.test(prompt)) return null;
  prompt = prompt.replace(/^\/\S+\s+/, "");
  prompt = stripConversationalLead(prompt);
  if (!/[\p{L}\p{N}].*[\p{L}\p{N}]/u.test(prompt)) return null;

  const words = prompt.split(" ").filter(Boolean);
  const kept: string[] = [];
  let length = 0;
  for (const word of words) {
    const nextLength = length + (kept.length ? 1 : 0) + word.length;
    if (kept.length >= MAX_TITLE_WORDS || nextLength > MAX_TITLE_CHARS - 1) break;
    kept.push(word);
    length = nextLength;
  }
  if (kept.length === 0) return null;
  const truncated = kept.length < words.length;
  const title = kept.join(" ").replace(/[,:;.!?\-–—]+$/, "").trim();
  return title ? `${title}${truncated ? "…" : ""}` : null;
}

function stripConversationalLead(prompt: string): string {
  const lead = /^(?:(?:please\s+)?(?:can|could|would|will)\s+you\s+|please\s+|i\s+(?:need|want)\s+you\s+to\s+|help\s+me\s+(?:to\s+)?)/i;
  let result = prompt;
  while (lead.test(result)) result = result.replace(lead, "").trimStart();
  return result;
}

function insertAt(value: string, cursor: number, text: string): [string, number] {
  const room = Math.max(0, MAX_PROMPT_CHARS - value.length);
  const inserted = text.slice(0, room);
  return [value.slice(0, cursor) + inserted + value.slice(cursor), cursor + inserted.length];
}

/** Reconstructs the current TUI input line without ever putting the prompt in app state. */
export class TerminalPromptTracker {
  private value = "";
  private cursor = 0;
  private pasted = false;

  push(data: string): string | null {
    for (let index = 0; index < data.length; ) {
      const rest = data.slice(index);
      if (rest.startsWith("\x1b[200~")) {
        this.pasted = true;
        index += 6;
        continue;
      }
      if (rest.startsWith("\x1b[201~")) {
        this.pasted = false;
        index += 6;
        continue;
      }
      const sequence = rest.match(/^\x1b\[[0-9;?]*[ -/]*[@-~]/)?.[0];
      if (sequence) {
        this.applySequence(sequence);
        index += sequence.length;
        continue;
      }

      const char = data[index++];
      if (this.pasted && (char === "\r" || char === "\n")) {
        [this.value, this.cursor] = insertAt(this.value, this.cursor, " ");
      } else if (char === "\r" || char === "\n") {
        const title = titleFromPrompt(this.value);
        this.reset();
        if (title) return title;
      } else if (char === "\x7f" || char === "\b") {
        if (this.cursor > 0) {
          this.value = this.value.slice(0, this.cursor - 1) + this.value.slice(this.cursor);
          this.cursor -= 1;
        }
      } else if (char === "\x01") {
        this.cursor = 0;
      } else if (char === "\x05") {
        this.cursor = this.value.length;
      } else if (char === "\x15") {
        this.reset();
      } else if (char >= " ") {
        [this.value, this.cursor] = insertAt(this.value, this.cursor, char);
      }
    }
    return null;
  }

  private applySequence(sequence: string): void {
    const final = sequence.at(-1);
    if (final === "D") this.cursor = Math.max(0, this.cursor - 1);
    if (final === "C") this.cursor = Math.min(this.value.length, this.cursor + 1);
    if (final === "H" || sequence === "\x1b[1~") this.cursor = 0;
    if (final === "F" || sequence === "\x1b[4~") this.cursor = this.value.length;
    if (sequence === "\x1b[3~" && this.cursor < this.value.length) {
      this.value = this.value.slice(0, this.cursor) + this.value.slice(this.cursor + 1);
    }
  }

  private reset(): void {
    this.value = "";
    this.cursor = 0;
    this.pasted = false;
  }
}

const trackers = new Map<number, TerminalPromptTracker>();

export function observeTerminalPrompt(id: number, data: string): string | null {
  const tracker = trackers.get(id) ?? new TerminalPromptTracker();
  trackers.set(id, tracker);
  const title = tracker.push(data);
  if (title) trackers.delete(id);
  return title;
}

export function clearTerminalPrompt(id: number): void {
  trackers.delete(id);
}
