// Which generated artwork belongs to a model. Kept free of `require` so the
// mapping can be tested in plain Node; `modelArtwork.ts` binds keys to images.
//
// The match is exact on the model's bare key, never a substring. Desktop's port
// (`desktop-tauri/src/lib/modelArtworkData.ts`) matches Claude and Gemini by
// substring, and that quietly mis-attributes artwork: `claude-fable-5.1` picks up
// `claude-fable-5`'s picture and wears a tile that reads "5", and
// `gemini-3.5-flash-lite` wears `gemini-3.5-flash`'s. A tile showing another
// model's version number is worse than no tile, so a model with no artwork of its
// own falls back to its company mark instead.
const KEYS: string[] = [
  'claude-opus-5-fast', 'claude-opus-5', 'claude-opus-4.8-fast', 'claude-opus-4.8',
  'claude-opus-4.7-fast', 'claude-opus-4.7', 'claude-opus-4.6', 'claude-opus-4.5',
  'claude-opus-4.1', 'claude-opus-4', 'claude-sonnet-5', 'claude-sonnet-4.6',
  'claude-sonnet-4.5', 'claude-fable-5', 'claude-haiku-4.5',
  'gemini-3.8-pro', 'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash',
  'gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.1-pro', 'gemini-3.1-flash-lite',
  'gemini-2.5-pro', 'gemini-2.5-flash-lite', 'gemini-2.5-flash',
  'gpt-6-astra', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.6-sol',
  'gpt-5.5', 'gpt-5.4-mini', 'gpt-5.4', 'gpt-5-codex',
];
const known = new Set(KEYS);

/** The artwork key for a model, or null when only a company mark exists. */
export function modelArtworkKey(id: string): string | null {
  // Drop the vendor, and any `:free` / `:batch` style suffix, then compare whole.
  const bare = id.trim().toLowerCase().replace(/^[^/]*\//, '').replace(/:.*$/, '');
  return known.has(bare) ? bare : null;
}
