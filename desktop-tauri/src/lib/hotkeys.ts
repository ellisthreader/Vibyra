export type HotkeyAction = "voice" | "screenshot";

export const DEFAULT_VOICE_SHORTCUT = "F8";
export const DEFAULT_SCREENSHOT_SHORTCUT = "F9";

const NAMED_KEYS: Record<string, string> = {
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  ArrowUp: "Up",
  Backspace: "Backspace",
  Delete: "Delete",
  End: "End",
  Enter: "Enter",
  Home: "Home",
  Insert: "Insert",
  PageDown: "PageDown",
  PageUp: "PageUp",
  Space: "Space",
  Tab: "Tab",
};

function eventKey(code: string): string | null {
  if (/^F(?:[1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  return NAMED_KEYS[code] ?? null;
}

export function shortcutFromEvent(event: KeyboardEvent): string | null {
  const key = eventKey(event.code);
  if (!key) return null;
  const isFunctionKey = key.startsWith("F") && /^F\d+$/.test(key);
  if (!isFunctionKey && !event.ctrlKey && !event.metaKey && !event.altKey) return null;
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push("CommandOrControl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  parts.push(key);
  return parts.join("+");
}

export function shortcutLabel(shortcut: string): string {
  return shortcut.replace("CommandOrControl", "Ctrl/Cmd").replaceAll("+", " + ");
}
