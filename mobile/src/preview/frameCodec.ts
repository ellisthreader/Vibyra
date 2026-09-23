/** Preview frames are encrypted by the existing Noise connection. */
export const PREVIEW_CHUNK = 16 * 1024;
export const PREVIEW_WINDOW = 64 * 1024;
const HEADER = 20;
const MAX_U64 = (1n << 64n) - 1n;
const MAX_U32 = 0xffff_ffff;

export interface PreviewKey {
  id: string;
  generation: string;
}
export type PreviewFrame =
  | { kind: 'open' | 'cancel'; key: PreviewKey }
  | { kind: 'credit'; key: PreviewKey; total: string }
  | { kind: 'data'; key: PreviewKey; sequence: number; bytes: Uint8Array }
  | { kind: 'end'; key: PreviewKey; sequence: number };

function positiveU64(value: string): bigint {
  if (!/^[1-9]\d{0,19}$/.test(value)) throw new Error('Invalid Preview stream identity.');
  const number = BigInt(value);
  if (number > MAX_U64) throw new Error('Invalid Preview stream identity.');
  return number;
}

function nonnegativeU64(value: string): bigint {
  if (!/^(0|[1-9]\d{0,19})$/.test(value)) throw new Error('Invalid Preview credit.');
  const number = BigInt(value);
  if (number > MAX_U64) throw new Error('Invalid Preview credit.');
  return number;
}

function sequence(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > MAX_U32)
    throw new Error('Invalid Preview sequence.');
  return value;
}

export function encodePreviewFrame(frame: PreviewFrame): string {
  const extra =
    frame.kind === 'credit'
      ? 8
      : frame.kind === 'end'
        ? 4
        : frame.kind === 'data'
          ? 4 + frame.bytes.length
          : 0;
  if (frame.kind === 'data' && (frame.bytes.length < 1 || frame.bytes.length > PREVIEW_CHUNK)) {
    throw new Error('Invalid Preview chunk size.');
  }
  const bytes = new Uint8Array(HEADER + extra);
  const view = new DataView(bytes.buffer);
  bytes[0] = 0x56;
  bytes[1] = 0x50;
  bytes[2] = 1;
  bytes[3] = { open: 1, credit: 2, data: 3, end: 4, cancel: 5 }[frame.kind];
  view.setBigUint64(4, positiveU64(frame.key.id));
  view.setBigUint64(12, positiveU64(frame.key.generation));
  if (frame.kind === 'credit') view.setBigUint64(HEADER, nonnegativeU64(frame.total));
  if (frame.kind === 'data') {
    view.setUint32(HEADER, sequence(frame.sequence));
    bytes.set(frame.bytes, HEADER + 4);
  }
  if (frame.kind === 'end') view.setUint32(HEADER, sequence(frame.sequence));
  return btoa(String.fromCharCode(...bytes));
}

export function decodePreviewFrame(encoded: string): PreviewFrame {
  if (encoded.length > 24000 || encoded.length === 0)
    throw new Error('Invalid Preview frame size.');
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
  } catch {
    throw new Error('Invalid Preview frame encoding.');
  }
  return decodePreviewBytes(bytes);
}

export function decodePreviewBytes(bytes: Uint8Array): PreviewFrame {
  if (
    bytes.length < HEADER ||
    bytes.length > HEADER + 4 + PREVIEW_CHUNK ||
    bytes[0] !== 0x56 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 1
  ) {
    throw new Error('Invalid Preview frame header.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const key = { id: view.getBigUint64(4).toString(), generation: view.getBigUint64(12).toString() };
  positiveU64(key.id);
  positiveU64(key.generation);
  const rest = bytes.length - HEADER;
  switch (bytes[3]) {
    case 1:
      if (rest === 0) return { kind: 'open', key };
      break;
    case 2:
      if (rest === 8) return { kind: 'credit', key, total: view.getBigUint64(HEADER).toString() };
      break;
    case 3:
      if (rest >= 5)
        return {
          kind: 'data',
          key,
          sequence: view.getUint32(HEADER),
          bytes: bytes.slice(HEADER + 4),
        };
      break;
    case 4:
      if (rest === 4) return { kind: 'end', key, sequence: view.getUint32(HEADER) };
      break;
    case 5:
      if (rest === 0) return { kind: 'cancel', key };
      break;
  }
  throw new Error('Invalid Preview frame body.');
}
