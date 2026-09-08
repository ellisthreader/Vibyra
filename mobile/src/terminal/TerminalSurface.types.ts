export interface TerminalSurfaceProps {
  output: string;
  onInput(data: string): void;
  onResize(cols: number, rows: number): void;
  onPasteMode?(enabled: boolean): void;
  disabled: boolean;
}
