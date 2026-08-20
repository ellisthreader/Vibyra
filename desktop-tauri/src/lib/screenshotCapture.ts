import type { CapturedScreenshot } from "../types";

const CAPTURE_SIGNATURE = [86, 83, 72, 1] as const;
const HEADER_BYTES = 12;
const MAX_CAPTURE_PIXELS = 50_000_000;

function captureBytes(payload: ArrayBuffer | Uint8Array): Uint8Array {
  return payload instanceof Uint8Array ? payload : new Uint8Array(payload);
}

export function capturedScreenshotFromBytes(
  payload: ArrayBuffer | Uint8Array,
): CapturedScreenshot {
  const bytes = captureBytes(payload);
  if (bytes.byteLength < HEADER_BYTES
    || CAPTURE_SIGNATURE.some((value, index) => bytes[index] !== value)) {
    throw new Error("The native screenshot response is invalid.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(4);
  const height = view.getUint32(8);
  const pixelBytes = width * height * 4;
  if (!width || !height || !Number.isSafeInteger(pixelBytes)
    || width * height > MAX_CAPTURE_PIXELS
    || bytes.byteLength !== HEADER_BYTES + pixelBytes) {
    throw new Error("The native screenshot dimensions are invalid.");
  }
  return {
    width,
    height,
    // Own the buffer beyond the IPC callback. WebKitGTK may release Tauri's
    // borrowed response body before React performs the first canvas paint.
    pixels: new Uint8ClampedArray(bytes.subarray(HEADER_BYTES)),
  };
}
