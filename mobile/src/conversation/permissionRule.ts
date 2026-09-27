/** Present Codex's exact exec-policy token prefix without JSON punctuation. */
export function rulePrefix(summary?: string) {
  const encoded = summary?.match(/command-prefix tokens: (\[.*\])\. Future matching commands/)?.[1];
  if (!encoded) return null;
  try {
    const tokens: unknown = JSON.parse(encoded);
    if (!Array.isArray(tokens) || !tokens.every(token => typeof token === 'string')) return null;
    return tokens.map(token => /\s|["']/.test(token) ? JSON.stringify(token) : token).join(' ');
  } catch { return null; }
}
