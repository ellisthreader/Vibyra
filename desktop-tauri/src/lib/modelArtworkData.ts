// Slug → artwork file mapping ported from the old app (15 Claude, 7 GPT,
// 6 Gemini). Pure data — no Vite APIs — so the catalog can rank models
// that own artwork above the ones that only get a company mark.
// OpenAI needs an exact match on the bare model key; Claude and Gemini
// match by substring on the model's full identity (-fast entries first).

const CLAUDE_ICONS: Array<[string, string]> = [
  ["claude-opus-5-fast", "claude-opus-5-fast.png"],
  ["claude-opus-5", "claude-opus-5.png"],
  ["claude-opus-4-8-fast", "claude-opus-4.8-fast.png"],
  ["claude-opus-4-7-fast", "claude-opus-4.7-fast.png"],
  ["claude-opus-4-8", "claude-opus-4.8.png"],
  ["claude-opus-4-7", "claude-opus-4.7.png"],
  ["claude-opus-4-6", "claude-opus-4.6.png"],
  ["claude-opus-4-5", "claude-opus-4.5.png"],
  ["claude-opus-4-1", "claude-opus-4.1.png"],
  ["claude-sonnet-5", "claude-sonnet-5.png"],
  ["claude-sonnet-4-6", "claude-sonnet-4.6.png"],
  ["claude-sonnet-4-5", "claude-sonnet-4.5.png"],
  // Shares the Fable plate until 5.1 gets its own; the art carries no minor.
  ["claude-fable-5-1", "claude-fable-5.png"],
  ["claude-fable-5", "claude-fable-5.png"],
  ["claude-haiku-4-5", "claude-haiku-4.5.png"],
  ["claude-opus-4", "claude-opus-4.png"],
];

const GEMINI_ICONS: Array<[string, string]> = [
  ["gemini-3-1-flash-lite", "gemini-3.1-flash-lite.png"],
  ["gemini-3-1-pro", "gemini-3.1-pro.png"],
  ["gemini-3-5-flash", "gemini-3.5-flash.png"],
  ["gemini-2-5-flash-lite", "gemini-2.5-flash-lite.png"],
  ["gemini-2-5-flash", "gemini-2.5-flash.png"],
  ["gemini-2-5-pro", "gemini-2.5-pro.png"],
];

const OPENAI_ICONS: Array<[string, string]> = [
  ["gpt-5-6-terra", "gpt-5.6-terra.png"],
  ["gpt-5-6-luna", "gpt-5.6-luna.png"],
  ["gpt-5-6-sol", "gpt-5.6-sol.png"],
  ["gpt-5-codex", "gpt-5-codex.png"],
  ["gpt-5-4-mini", "gpt-5.4-mini.png"],
  ["gpt-5-5", "gpt-5.5.png"],
  ["gpt-5-4", "gpt-5.4.png"],
];

const NATIVE_ACCOUNT_ICONS: Record<string, Array<[string, string]>> = {
  Anthropic: CLAUDE_ICONS,
  Google: GEMINI_ICONS,
  OpenAI: OPENAI_ICONS,
};

function normalize(value: string): string {
  return value.toLowerCase().replace(/[.\s_]+/g, "-");
}

/** Artwork filename for a model, or null when only a company mark exists. */
export function modelArtworkFile(id: string, label = ""): string | null {
  const bareKey = normalize(id.trim().replace(/^openai\//i, "")).replace(/:.*$/, "");
  const exact = OPENAI_ICONS.find(([slug]) => bareKey === slug)?.[1];
  if (exact) return exact;
  const identity = normalize(`${id} ${label}`);
  return (
    CLAUDE_ICONS.find(([slug]) => identity.includes(slug))?.[1] ??
    GEMINI_ICONS.find(([slug]) => identity.includes(slug))?.[1] ??
    null
  );
}

/** True only for curated model IDs known to be accepted by an account-owned CLI. */
export function nativeAccountModelSupported(company: string, id: string): boolean {
  const icons = NATIVE_ACCOUNT_ICONS[company];
  if (!icons || id.includes(":")) return false;
  const bare = id.trim().replace(/^[^/]+\//, "");
  const key = normalize(bare);
  return icons.some(([slug]) => slug === key);
}
