// Extension spelled out so the test runner, which strips types rather than
// resolving like a bundler, can reach this module.
import { isMac } from "./platform.ts";

export type HotkeyAction = "voice" | "screenshot" | "talk";

export const DEFAULT_VOICE_SHORTCUT = "F8";
export const DEFAULT_SCREENSHOT_SHORTCUT = "F9";
export const DEFAULT_TALK_SHORTCUT = "F10";

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
  if (event.metaKey || (!isMac && event.ctrlKey)) parts.push("CommandOrControl");
  if (isMac && event.ctrlKey) parts.push("Control");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  parts.push(key);
  return parts.join("+");
}

const MAC_CAPS: Record<string, string> = { CommandOrControl: "⌘", Control: "⌃", Shift: "⇧", Alt: "⌥" };
const PC_CAPS: Record<string, string> = { CommandOrControl: "Ctrl" };

/** A recorded shortcut split the way it is pressed, one entry per key, so the
 * page can draw a cap for each rather than one run of glyphs. */
export function shortcutCaps(shortcut: string): string[] {
  return shortcut.split("+").map((part) => (isMac ? MAC_CAPS : PC_CAPS)[part] ?? part);
}

export function shortcutLabel(shortcut: string): string {
  return shortcutCaps(shortcut).join(isMac ? "" : " + ");
}
