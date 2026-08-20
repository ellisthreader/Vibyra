// Shapes exchanged with the screenshot and voice commands in `ipc/tools.ts`.
// Re-exported from `types.ts`, which stays the single import site.

export interface Screenshot {
  path: string;
  width: number;
  height: number;
  thumbDataUrl: string;
}

/** A fresh capture: raw RGBA straight off the native grab, not yet encoded. */
export interface CapturedScreenshot {
  width: number;
  height: number;
  pixels: Uint8ClampedArray<ArrayBuffer>;
}

export interface VoiceStatus {
  recorder: boolean;
  keyConfigured: boolean;
}
