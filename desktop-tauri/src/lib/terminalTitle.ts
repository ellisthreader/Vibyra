export interface TerminalTitleState {
  customTitle: string | null;
  chatTitle: string | null;
  osc: string | null;
  title: string;
}

const OSC_COLOUR_REPLY = /\](?:4;\d+;|(?:10|11|12);)(?:rgb:|\?)/i;

function containsControlCharacter(value: string): boolean {
  return Array.from(value).some((char) => {
    const code = char.codePointAt(0) ?? 0;
    return code < 0x20 || (code >= 0x7f && code <= 0x9f);
  });
}

/** Accepts only locally-generated chat titles, including persisted older ones. */
export function normalizeTerminalChatTitle(value: string | null | undefined): string | null {
  const title = value?.trim() ?? "";
  if (!title || Array.from(title).length > 64) return null;
  if (containsControlCharacter(title) || OSC_COLOUR_REPLY.test(title)) return null;
  return title;
}

/** Raw provider titles are untrusted terminal output and never expose protocol replies. */
export function normalizeTerminalOscTitle(value: string | null | undefined): string | null {
  const title = value?.trim() ?? "";
  if (!title || containsControlCharacter(title) || OSC_COLOUR_REPLY.test(title)) return null;
  return title;
}

/** Manual names win, then chat-aware names, then the CLI's raw terminal title. */
export function terminalDisplayTitle(pane: TerminalTitleState): string {
  return (
    pane.customTitle ||
    normalizeTerminalChatTitle(pane.chatTitle) ||
    normalizeTerminalOscTitle(pane.osc) ||
    pane.title
  );
}
