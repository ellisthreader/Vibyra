export interface TerminalSurfaceProps {
  output: string;
  onInput(data: string): void;
  onResize(cols: number, rows: number): void;
  onPasteMode?(enabled: boolean): void;
  disabled: boolean;
  /** The type size a person pinched to last time, so it survives reopening. */
  fontSize?: number;
  onFontSize?(size: number): void;
}
