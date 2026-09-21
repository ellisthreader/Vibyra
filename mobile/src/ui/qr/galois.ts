/**
 * Reed-Solomon error correction over GF(256), the arithmetic a QR symbol's recovery
 * codewords are made of. The log/antilog tables are built once for the process, so
 * drawing a code is a few hundred table lookups rather than any real work.
 */
const exp = new Uint8Array(512);
const log = new Uint8Array(256);
for (let i = 0, value = 1; i < 255; i += 1) {
  exp[i] = value;
  log[value] = i;
  value <<= 1;
  // x^8 + x^4 + x^3 + x^2 + 1, the QR field's primitive polynomial.
  if (value & 0x100) value ^= 0x11d;
}
for (let i = 255; i < 512; i += 1) exp[i] = exp[i - 255];

const multiply = (a: number, b: number) => (a === 0 || b === 0 ? 0 : exp[log[a] + log[b]]);

/** The generator polynomial for `count` error-correction codewords, as coefficients. */
function generator(count: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let degree = 0; degree < count; degree += 1) {
    const next = new Uint8Array(poly.length + 1);
    for (let i = 0; i < poly.length; i += 1) {
      next[i] ^= poly[i];
      next[i + 1] ^= multiply(poly[i], exp[degree]);
    }
    poly = next;
  }
  return poly;
}
const generators = new Map<number, Uint8Array>();

/** The `count` error-correction codewords that follow one block of data. */
export function remainder(data: Uint8Array, count: number): Uint8Array {
  let poly = generators.get(count);
  if (!poly) generators.set(count, poly = generator(count));
  const result = new Uint8Array(count);
  for (const byte of data) {
    const factor = byte ^ result[0];
    result.copyWithin(0, 1);
    result[count - 1] = 0;
    if (factor !== 0) for (let i = 0; i < count; i += 1) result[i] ^= multiply(poly[i + 1], factor);
  }
  return result;
}
