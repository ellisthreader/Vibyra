export interface TerminalTitleState {
  customTitle: string | null;
  chatTitle: string | null;
  osc: string | null;
  title: string;
}

/** Manual names win, then chat-aware names, then the CLI's raw terminal title. */
export function terminalDisplayTitle(pane: TerminalTitleState): string {
  return pane.customTitle || pane.chatTitle || pane.osc || pane.title;
}
