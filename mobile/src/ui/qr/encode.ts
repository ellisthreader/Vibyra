import { remainder } from './galois';
import { capacity, versions, type VersionSpec } from './tables';

/**
 * Text to the final stream of codewords: byte mode, then the interleaving a decoder
 * expects — one codeword from every block in turn, so damage to any one part of the
 * symbol is spread thinly across all of them rather than lost from one place.
 */
export interface Encoded {
  version: number;
  spec: VersionSpec;
  codewords: Uint8Array;
}

const utf8 = (text: string) => new TextEncoder().encode(text);

export function encode(text: string): Encoded {
  const bytes = utf8(text);
  const index = versions.findIndex(
    (spec, position) => bytes.length + (position + 1 < 10 ? 2 : 3) <= capacity(spec),
  );
  if (index < 0) throw new Error('That is too long to draw as a QR code.');
  const version = index + 1;
  const spec = versions[index];
  return {
    version,
    spec,
    codewords: interleave(blocks(payload(bytes, version, capacity(spec)), spec), spec),
  };
}
/** Mode, length, the bytes themselves, then the standard padding out to the version's size. */
function payload(bytes: Uint8Array, version: number, size: number): Uint8Array {
  const lengthBits = version < 10 ? 8 : 16;
  const out = new Uint8Array(size);
  let at = 0;
  const push = (value: number, bits: number) => {
    for (let bit = bits - 1; bit >= 0; bit -= 1) {
      if ((value >> bit) & 1) out[at >> 3] |= 0x80 >> (at & 7);
      at += 1;
    }
  };
  push(0b0100, 4);
  push(bytes.length, lengthBits);
  for (const byte of bytes) push(byte, 8);
  // The terminator is up to four zero bits, and only as many as still fit.
  push(0, Math.min(4, size * 8 - at));
  at = (at + 7) & ~7;
  // Whatever is left alternates between these two pad codewords, which is what the
  // specification asks for and what a decoder skips over after reading the length.
  for (let byte = at >> 3, pad = 0; byte < size; byte += 1, pad += 1)
    out[byte] = pad % 2 === 0 ? 0xec : 0x11;
  return out;
}
interface Block {
  data: Uint8Array;
  ec: Uint8Array;
}
function blocks(data: Uint8Array, spec: VersionSpec): Block[] {
  const made: Block[] = [];
  let at = 0;
  for (const [count, size] of spec.groups) {
    for (let i = 0; i < count; i += 1, at += size) {
      const slice = data.subarray(at, at + size);
      made.push({ data: slice, ec: remainder(slice, spec.ec) });
    }
  }
  return made;
}
function interleave(made: Block[], spec: VersionSpec): Uint8Array {
  const longest = Math.max(...made.map((block) => block.data.length));
  const out: number[] = [];
  for (let i = 0; i < longest; i += 1)
    for (const block of made) if (i < block.data.length) out.push(block.data[i]);
  for (let i = 0; i < spec.ec; i += 1) for (const block of made) out.push(block.ec[i]);
  return Uint8Array.from(out);
}
