const TERMINAL_FONT_SAMPLE = "W";
const TERMINAL_FONT_SPECS = [
  '400 13px "JetBrains Mono Variable"',
  '700 13px "JetBrains Mono Variable"',
];

export interface TerminalFontSet {
  readonly ready?: PromiseLike<unknown>;
  load(font: string, text?: string): PromiseLike<ArrayLike<unknown>>;
}

/** Waits for CSS font-face registration, then loads both terminal weights. */
export async function loadTerminalFonts(fonts: TerminalFontSet): Promise<void> {
  // A module can run before WebKit has registered the @font-face rules. In
  // that window `load()` resolves with an empty list, which is not readiness.
  await fonts.ready;
  const results = await Promise.allSettled(
    TERMINAL_FONT_SPECS.map((font) => fonts.load(font, TERMINAL_FONT_SAMPLE)),
  );
  if (
    results.some(
      (result) => result.status === "rejected" || result.value.length === 0,
    )
  ) {
    throw new Error("The bundled terminal font did not load.");
  }
}

let terminalFontReady: Promise<void> | null = null;

/**
 * Starts the bundled local font load once and fails open if WebKit rejects it.
 * xterm measures cells only when it opens, so callers await this before open.
 */
export function initTerminalFont(): Promise<void> {
  if (terminalFontReady) return terminalFontReady;
  if (!("fonts" in document)) return Promise.resolve();

  terminalFontReady = loadTerminalFonts(document.fonts).catch(() => {});
  return terminalFontReady;
}
