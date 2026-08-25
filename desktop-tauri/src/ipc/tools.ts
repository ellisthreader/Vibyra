import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { capturedScreenshotFromBytes } from "../lib/screenshotCapture";
import type { CapturedScreenshot, ClipboardPaste, Screenshot, VoiceStatus } from "../types";

export async function captureScreen(): Promise<CapturedScreenshot> {
  const pixels = await invoke<ArrayBuffer | Uint8Array>("capture_screen");
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

/**
 * Microphone loudness, 0 to 1, roughly 20 times a second while recording.
 *
 * Emitted by the native meter reading the capture already on disk — the
 * renderer never opens a microphone of its own.
 */
export function onVoiceLevel(callback: (level: number) => void): Promise<UnlistenFn> {
  return listen<number>("voice:level", (event) => callback(event.payload));
}

export function voiceStatus(): Promise<VoiceStatus> {
  return invoke("voice_status");
}

export function voiceStart(): Promise<void> {
  return invoke("voice_start");
}

/** Stops recording; transcribes unless `discard`. Resolves to the text. */
export function voiceStop(discard: boolean): Promise<string | null> {
  return invoke("voice_stop", { discard });
}
