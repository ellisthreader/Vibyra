export function desktopPlatformFor(platform: string): "mac" | "linux" | "desktop" {
  if (/Mac|iPhone|iPad/.test(platform)) return "mac";
  return /Linux/.test(platform) ? "linux" : "desktop";
}

export const desktopPlatform = desktopPlatformFor(typeof navigator === "undefined" ? "" : navigator.platform);
export const isMac = desktopPlatform === "mac";
export const isLinux = desktopPlatform === "linux";
/** Product copy keeps the Mac wording while naming the computer it actually runs on. */
export const computerName = isMac ? "Mac" : "computer";
export const platformName = isMac ? "Mac" : isLinux ? "Linux" : "Windows";

/** Keep app shortcuts separate from the control keys owned by terminal programs. */
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
