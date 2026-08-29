/**
 * One shared empty array, for selector fallbacks.
 *
 * Zustand compares a selector's result with `Object.is`, so
 * `state.chats[id] ?? []` returns a *new* array every call while the key is
 * missing — and the component re-renders on every unrelated store change until
 * the data loads. These panels sit beside live terminals, where a render nobody
 * asked for costs the renderer something, so the fallback is one frozen
 * reference rather than a fresh literal.
 *
 * `readonly` on purpose: nothing may push into the shared instance.
 */
export const NONE: readonly never[] = Object.freeze([]);
