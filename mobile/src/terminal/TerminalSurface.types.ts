export interface TerminalGrid {
  cols: number;
  rows: number;
}
export interface TerminalSurfaceProps {
  output: string;
  /** The grid the computer drew `output` for, when it said. History is laid
   *  out at that width first and then reflowed to this phone's, instead of
   *  being shredded into it. */
  grid?: TerminalGrid | null;
  /** The computer keeps its own grid — a Mac pane the person is working in.
   *  `grid` is drawn exactly and zoomed on this phone, never reported back. */
  mirror?: boolean;
  onInput(data: string): void;
  onResize(cols: number, rows: number): void;
  onPasteMode?(enabled: boolean): void;
  /** Whether the newest line is in view. Off it, new output arrives unseen. */
  onFollow?(atBottom: boolean): void;
  /** A finger tapped the output: on a phone, a request to type (or to stop). */
  onTap?(): void;
  disabled: boolean;
  /** The type size a person pinched to last time, so it survives reopening. */
  fontSize?: number;
  onFontSize?(size: number): void;
}
export interface TerminalSurfaceHandle {
  scrollToBottom(): void;
}
