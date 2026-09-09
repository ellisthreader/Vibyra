// Verified CLI model IDs, independent of the optional model artwork.
// Keep exact IDs: provider-only variants must still use Aider/OpenCode.
const MODELS: Record<string, string[]> = {
  OpenAI: [
    "gpt-6-astra", "gpt-5-6-sol", "gpt-5-6-terra", "gpt-5-6-luna",
    "gpt-5-3-codex-spark", "gpt-5-5", "gpt-5-4", "gpt-5-4-mini", "gpt-5-codex",
  ],
  Anthropic: [
    "claude-fable-5-1", "claude-fable-5", "claude-opus-5", "claude-opus-5-fast",
    "claude-sonnet-5", "claude-opus-4-8", "claude-opus-4-8-fast",
    "claude-opus-4-7", "claude-opus-4-7-fast", "claude-opus-4-6",
    "claude-opus-4-5", "claude-opus-4-1", "claude-opus-4",
    "claude-sonnet-4-6", "claude-sonnet-4-5", "claude-haiku-4-5",
  ],
  Google: [
    "gemini-3-1-flash-lite", "gemini-3-1-pro", "gemini-3-5-flash",
    "gemini-2-5-flash-lite", "gemini-2-5-flash", "gemini-2-5-pro",
  ],
};

export function nativeAccountModelSupported(company: string, id: string): boolean {
  if (id.includes(":")) return false;
  const key = id.trim().replace(/^[^/]+\//, "").toLowerCase().replace(/\./g, "-");
  return MODELS[company]?.includes(key) ?? false;
}
