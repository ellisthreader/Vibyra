/** Respect an installed custom font; map the default name to our bundled font. */
export function terminalFont(userStack: string): string {
  if (!userStack.trim()) return '"JetBrains Mono Variable", monospace';
  return userStack.split(",").map((family) => {
    const name = family.trim().replace(/^["']|["']$/g, "");
    return name === "JetBrains Mono" ? '"JetBrains Mono Variable"' : family.trim();
  }).join(", ");
}
