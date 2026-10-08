import type { CapturedScreenshot } from '../types';

/** Local visual fixture for inspecting the standalone editor without screen consent. */
export function screenshotDemo(): CapturedScreenshot {
  const canvas = document.createElement('canvas');
  canvas.width = 1440; canvas.height = 900;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#dde3e9'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#f7f9fa'; ctx.fillRect(90, 70, 1260, 750);
  ctx.fillStyle = '#edf1f4'; ctx.fillRect(90, 70, 1260, 56);
  ctx.fillStyle = '#3c60d9'; ctx.fillRect(90, 126, 240, 694);
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 27px sans-serif'; ctx.fillText('Project workspace', 120, 192);
  ctx.fillStyle = '#384454'; ctx.font = 'bold 42px sans-serif'; ctx.fillText('A clearer place to work', 380, 248);
  ctx.fillStyle = '#8d9aa8'; ctx.font = '22px sans-serif'; ctx.fillText('Capture, annotate, share and save.', 382, 291);
  ctx.fillStyle = '#e6ecf2'; ctx.fillRect(380, 355, 890, 340);
  ctx.fillStyle = '#aac1d1'; ctx.fillRect(430, 410, 270, 230);
  ctx.fillStyle = '#ccdae4'; ctx.fillRect(745, 410, 480, 34);
  ctx.fillRect(745, 475, 390, 22); ctx.fillRect(745, 525, 445, 22);
  return { width: canvas.width, height: canvas.height,
    pixels: new Uint8ClampedArray(ctx.getImageData(0, 0, canvas.width, canvas.height).data) };
}
