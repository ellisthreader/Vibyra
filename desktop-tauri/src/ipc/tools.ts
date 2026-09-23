import { invoke } from "@tauri-apps/api/core";
import { capturedScreenshotFromBytes } from "../lib/screenshotCapture";
import { useSettingsStore } from "../state/settingsStore";
import type { CapturedScreenshot, ClipboardPaste, Screenshot, SpeechVoice, VoiceLevel, VoiceStatus } from "../types";

export async function captureScreen(selection = false): Promise<CapturedScreenshot> {
  const pixels = await invoke<ArrayBuffer | Uint8Array>("capture_screen", { selection });
  return capturedScreenshotFromBytes(pixels);
}

export function finishScreenshotEdit(): Promise<void> {
  return invoke("finish_screenshot_edit");
}

export function copyScreenshot(dataUrl: string): Promise<void> {
  return invoke("copy_screenshot", { dataUrl });
}

export function copySavedScreenshot(path: string): Promise<void> {
  return invoke("copy_saved_screenshot", { path });
}

export function revealScreenshot(path: string): Promise<void> {
  return invoke("reveal_screenshot", { path });
}

/** Clipboard contents for a terminal paste, read natively (WebKit exposes no
 * image flavour to the page). */
export function readClipboardPaste(): Promise<ClipboardPaste> {
  return invoke("read_clipboard_paste");
}

export function saveScreenshot(dataUrl: string): Promise<Screenshot> {
  return invoke("save_screenshot", { dataUrl });
}

/** The voices this Mac can speak with. Empty off Mac. */
export function speechVoices(): Promise<SpeechVoice[]> {
  return invoke("speech_voices");
}

export function voiceStatus(): Promise<VoiceStatus> {
  return invoke("voice_status");
}

let voiceActions: Promise<unknown> = Promise.resolve();
function voiceAction<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const action = voiceActions.catch(() => {}).then(() => invoke<T>(command, args));
  voiceActions = action;
  return action;
}

export function voiceStart(): Promise<void> {
  return voiceAction("voice_start");
}

/** What the open microphone is hearing. Read outside the serialized queue so
 * polling a level never sits behind a start or stop. */
export function voiceLevel(): Promise<VoiceLevel> {
  return invoke("voice_level");
}

/** Stops recording; transcribes unless `discard`. Resolves to the text.
 *
 * The language is read here, at the one place every dictation passes through,
 * so telling Vibyra what you speak reaches the terminal, the chat draft and a
 * spoken conversation alike without any of them knowing about the setting. */
export function voiceStop(discard: boolean): Promise<string | null> {
  const language = useSettingsStore.getState().settings?.voiceLanguage || null;
  return voiceAction("voice_stop", { discard, language });
}
