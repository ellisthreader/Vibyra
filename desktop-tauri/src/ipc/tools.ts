import { invoke } from "@tauri-apps/api/core";
import { capturedScreenshotFromBytes } from "../lib/screenshotCapture";
import type { CapturedScreenshot, Screenshot, VoiceStatus } from "../types";

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

export function saveScreenshot(dataUrl: string): Promise<Screenshot> {
  return invoke("save_screenshot", { dataUrl });
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
