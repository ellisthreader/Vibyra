/** Stable identity for one pane across native session ids and app restarts. */
export function newPanePersistenceId(): string {
  const api = globalThis.crypto;
  if (typeof api?.randomUUID === "function") {
    return api.randomUUID();
  }
  if (typeof api?.getRandomValues === "function") {
    const bytes = api.getRandomValues(new Uint8Array(16));
    return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return `pane-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
