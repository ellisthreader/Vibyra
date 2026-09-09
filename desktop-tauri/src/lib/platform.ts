/** Keep app shortcuts separate from the control keys owned by terminal programs. */
export const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export function appModifier(event: Pick<KeyboardEvent, "metaKey" | "ctrlKey">, mac = isMac): boolean {
  return mac ? event.metaKey : event.ctrlKey;
}

export function keyLabel(keys: string, mac = isMac): string {
  return mac
    ? keys.replaceAll("Mod", "⌘").replaceAll("Shift", "⇧").replaceAll("Alt", "⌥").replaceAll("+", "")
    : keys.replaceAll("Mod", "Ctrl").replaceAll("+", " ");
}

export function terminalPasteKey(event: Pick<KeyboardEvent, "type" | "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">, mac = isMac): boolean {
  if (event.type !== "keydown" || event.code !== "KeyV" || event.altKey) return false;
  return mac && event.metaKey && !event.ctrlKey || event.ctrlKey && event.shiftKey && !event.metaKey;
}
