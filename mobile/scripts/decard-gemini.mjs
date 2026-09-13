import { readdir, readFile, writeFile } from 'node:fs/promises';

// The Gemini tiles inherited from Vibyra Desktop carry an opaque white card, which
// on a dark row reads as a bright block rather than a logo. This lifts the card and
// leaves the art, so the whole family sits on the theme like the company marks do.
//
// The fill starts from the canvas edge and only spreads through white that is
// connected to the outside, so the white core inside `gemini-3.5-flash`'s own
// gradient is never punched through. Idempotent: a tile that is already
// transparent is skipped, so re-copying from desktop and re-running is safe.
export async function decardGemini(page, dir) {
  const done = [];
  for (const file of (await readdir(dir)).filter(name => /^gemini-.*\.png$/.test(name))) {
    const source = `data:image/png;base64,${(await readFile(`${dir}/${file}`)).toString('base64')}`;
    const out = await page.evaluate(async ({ source }) => {
      const image = new Image();
      await new Promise((ok, fail) => { image.onload = ok; image.onerror = fail; image.src = source; });
      const canvas = Object.assign(document.createElement('canvas'), { width: image.width, height: image.height });
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      const { width: w, height: h } = canvas;
      const data = context.getImageData(0, 0, w, h);
      const px = data.data;
      // Nothing to do if the card has already been lifted.
      const probe = (20 * w + 20) * 4;
      if (px[probe + 3] !== 255) return null;
      const seen = new Uint8Array(w * h);
      const stack = [];
      for (let x = 0; x < w; x++) stack.push(x, 0, x, h - 1);
      for (let y = 0; y < h; y++) stack.push(0, y, w - 1, y);
      while (stack.length) {
        const y = stack.pop(); const x = stack.pop();
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const i = y * w + x;
        if (seen[i]) continue;
        const o = i * 4;
        if (px[o + 3] > 0 && !(px[o] >= 228 && px[o + 1] >= 228 && px[o + 2] >= 228)) continue;
        seen[i] = 1; px[o + 3] = 0;
        stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
      }
      context.putImageData(data, 0, 0);
      return canvas.toDataURL('image/png');
    }, { source });
    if (!out) continue;
    await writeFile(`${dir}/${file}`, Buffer.from(out.split(',')[1], 'base64'));
    done.push(file);
  }
  return done;
}
