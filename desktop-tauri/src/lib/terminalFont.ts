let fontReady: Promise<void> | null = null;

/**
 * Loads the bundled face before a terminal opens. xterm measures its cell and
 * rasterises its glyph atlas at `open()`, and a face that has not arrived yet
 * is silently replaced by the fallback there — metrics and cached glyphs stay
 * wrong until some option changes. A browser only fetches a web font once
 * something draws with it, so without this the first terminal would be that
 * something. Never rejects, and gives up after 1.5 s so a missing font can
 * hold nothing up.
 */
export function terminalFontReady(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return Promise.resolve();
  fontReady ??= Promise.race([
    document.fonts.load('13px "JetBrains Mono Variable"').then(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, 1_500)),
  ]).catch(() => undefined);
  return fontReady;
}

/** Respect an installed custom font; map the default name to our bundled font. */
export function terminalFont(userStack: string): string {
  if (!userStack.trim()) return '"JetBrains Mono Variable", monospace';
  return userStack.split(",").map((family) => {
    const name = family.trim().replace(/^["']|["']$/g, "");
    return name === "JetBrains Mono" ? '"JetBrains Mono Variable"' : family.trim();
  }).join(", ");
}
