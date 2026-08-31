import { invoke } from "@tauri-apps/api/core";

/**
 * Ask reading a reply aloud. Returns WAV bytes — see `commands/speech.rs` for
 * why the format is uncompressed rather than MP3.
 */
export async function synthesizeSpeech(text: string, voice: string): Promise<ArrayBuffer> {
  const audio = await invoke<ArrayBuffer | Uint8Array>("ai_speak", { text, voice });
  if (audio instanceof ArrayBuffer) return audio;
  // Tauri hands raw responses back as a byte array on some transports; copy
  // into a standalone buffer so decodeAudioData owns a clean ArrayBuffer.
  return Uint8Array.from(audio).buffer;
}
