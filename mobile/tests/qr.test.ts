// The QR encoder, proved the only way that matters: every code it draws is decoded
// back to the exact string by a scanner that has never seen this code.
import assert from 'node:assert/strict';
import test from 'node:test';
import jsQR from 'jsqr';
import { qrSymbol } from '../src/ui/qr';

const SCALE = 4;
const QUIET = 4;
/** The symbol as a scanner sees it: black on white, with the quiet zone around it. */
function raster(text: string) {
  const { side, dark } = qrSymbol(text);
  const width = (side + QUIET * 2) * SCALE;
  const pixels = new Uint8ClampedArray(width * width * 4).fill(255);
  for (let row = 0; row < side; row += 1) for (let col = 0; col < side; col += 1) {
    if (!dark[row][col]) continue;
    for (let y = 0; y < SCALE; y += 1) for (let x = 0; x < SCALE; x += 1) {
      const at = (((row + QUIET) * SCALE + y) * width + (col + QUIET) * SCALE + x) * 4;
      pixels[at] = pixels[at + 1] = pixels[at + 2] = 0;
    }
  }
  return { pixels, width };
}
const reads = (text: string) => {
  const { pixels, width } = raster(text);
  return jsQR(pixels, width, width)?.data;
};

test('a two-factor setup link scans back exactly', () => {
  const link = 'otpauth://totp/Vibyra:ellis@example.com?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Vibyra&algorithm=SHA1&digits=6&period=30';
  assert.equal(reads(link), link);
});
test('short, long and non-ASCII strings all survive the round trip', () => {
  for (const text of ['A', 'https://vibyra.app', 'x'.repeat(300), 'Café — naïve ☕', '0123456789'.repeat(12)])
    assert.equal(reads(text), text, text.slice(0, 24));
});
test('every version boundary in the table is reachable and readable', () => {
  // One string per length that pushes the encoder up a version, so a wrong capacity
  // or block table is caught rather than hidden by the one size we happen to draw.
  for (let length = 1; length <= 360; length += 7) {
    const text = 'v'.repeat(length);
    assert.equal(reads(text), text, `${length} characters`);
  }
});
test('a string too long for the table is refused rather than drawn wrong', () => {
  assert.throws(() => qrSymbol('x'.repeat(400)), /too long/);
});
