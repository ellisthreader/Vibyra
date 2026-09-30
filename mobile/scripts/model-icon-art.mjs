// The two artwork systems the shared model-icon set already uses, as HTML that
// headless Chrome renders to a 128x128 tile. Matching them by hand keeps a newly
// drawn model beside its siblings instead of announcing itself as the odd one.

const FONT = "'SF Pro Display','Helvetica Neue',Helvetica,Arial,sans-serif";
// The existing tiles are not full-bleed: their card sits inset in a transparent
// 128 square (measured 104-119 across), and the app draws the PNG at a fixed size,
// so a bleeding card renders visibly larger than the ones beside it.
const frame = (background, body, side, radius) => `<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;width:128px;height:128px;background:transparent}
  .tile{position:absolute;left:${(128 - side) / 2}px;top:${(128 - side) / 2}px;
    width:${side}px;height:${side}px;border-radius:${radius}px;overflow:hidden;
    background:${background};font-family:${FONT};-webkit-font-smoothing:antialiased}
  .label{position:absolute;left:0;right:0;text-align:center}
</style><div class="tile">${body}</div>`;

/**
 * Gemini: the four-pointed star over white, its gradient the one thing that
 * changes between models, with the version large and the tier in small
 * letterspaced caps under it.
 */
export function geminiIcon(version, tier, [from, via, to], accent) {
  // Measured against the existing tiles: 70 across and slightly less tall, its
  // centre a little above the card's middle.
  const star = `<svg width="70" height="67" viewBox="0 0 24 24" preserveAspectRatio="none" style="position:absolute;left:19px;top:4px">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${from}"/><stop offset="50%" stop-color="${via}"/>
      <stop offset="100%" stop-color="${to}"/></linearGradient></defs>
    <path fill="url(#g)" d="M12 24A20 20 0 0 0 0 12 20 20 0 0 0 12 0a20 20 0 0 0 12 12 20 20 0 0 0-12 12z"/>
  </svg>`;
  // The tier sits tight under the number, and a longer word is tracked in less so
  // "FLASH LITE" stays on one line at the same optical width as "PRO".
  const tracking = tier.length > 6 ? 1.1 : 2.6;
  const tierSize = tier.length > 6 ? 8 : 9;
  // The version takes its own tile's accent, not one fixed colour: the existing
  // set runs blue, green-teal, orange, mint and indigo, each drawn from the star
  // above it. The tier is the accent on Pro, and grey on the Flash variants —
  // mid grey on Flash, lighter on Flash Lite, which is the split already drawn.
  // The card is transparent, so the tile sits on whichever theme is showing and
  // the type has to read on both. The accent is mid-toned enough for that; the
  // tier grey is pulled to a middle value rather than the near-black the white
  // card allowed, which would vanish on a dark row.
  const tierColor = tier.startsWith('PRO') ? accent : tier.includes('LITE') ? '#A2ABBA' : '#8892A2';
  return frame('transparent', `${star}
    <div class="label" style="top:66px;font-size:29px;font-weight:500;color:${accent};letter-spacing:-0.5px">${version}</div>
    <div class="label" style="top:96px;font-size:${tierSize}px;font-weight:700;color:${tierColor};letter-spacing:${tracking}px">${tier}</div>`,
  108, 17);
}

/**
 * OpenAI: Sol, Terra and Luna are each photographed from space, so Astra is the
 * stars themselves — a deep field rather than one body. Drawn rather than
 * photographed, so it stays a little more graphic than its siblings.
 */
export function openAiIcon(version, name) {
  // A fixed spread, so regenerating the icon never reshuffles the sky.
  let seed = 20260909;
  const random = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  // Small and many. Larger dots read as falling snow rather than as a deep field,
  // and the type needs a clear band, so the sky thins out behind it.
  const stars = Array.from({ length: 320 }, () => {
    const x = random() * 128;
    const y = random() * 128;
    const clear = y > 34 && y < 96 && Math.abs(x - 64) < 46;
    if (clear && random() < 0.82) return '';
    const bright = random();
    const size = bright < 0.9 ? 0.35 + random() * 0.45 : 0.9 + random() * 0.5;
    const dim = (clear ? 0.18 : 0.4) + random() * (clear ? 0.2 : 0.55);
    const hue = random();
    const tint = hue < 0.16 ? '#c3d8ff' : hue < 0.28 ? '#ffe0bd' : '#ffffff';
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${size.toFixed(2)}"
      fill="${tint}" opacity="${dim.toFixed(2)}"/>`;
  }).join('');
  const sky = `<svg width="118" height="118" viewBox="0 0 128 128" style="position:absolute;inset:0">
    <defs>
      <radialGradient id="neb" cx="28%" cy="24%" r="72%">
        <stop offset="0%" stop-color="#3d5a9e" stop-opacity="0.85"/>
        <stop offset="45%" stop-color="#22305c" stop-opacity="0.5"/>
        <stop offset="100%" stop-color="#05070e" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="glow" cx="78%" cy="84%" r="62%">
        <stop offset="0%" stop-color="#8a4fd8" stop-opacity="0.6"/>
        <stop offset="100%" stop-color="#05070e" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="settle" cx="50%" cy="52%" r="58%">
        <stop offset="0%" stop-color="#05070e" stop-opacity="0.72"/>
        <stop offset="100%" stop-color="#05070e" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="128" height="128" fill="url(#neb)"/><rect width="128" height="128" fill="url(#glow)"/>
    ${stars}
    <rect width="128" height="128" fill="url(#settle)"/>
  </svg>`;
  // The number sits above centre and the name beneath it, matching Sol and Terra.
  // Luna and Terra sit inset at about 118; Sol alone bleeds. Astra is composed
  // like Luna and Terra, so it is sized with them.
  return frame('#05070e', `${sky}
    <div class="label" style="top:29px;font-size:40px;font-weight:700;color:#ffffff;letter-spacing:-1px;
      text-shadow:0 2px 14px rgba(0,0,0,0.7)">${version}</div>
    <div class="label" style="top:78px;font-size:12px;font-weight:700;color:#f2f5fb;letter-spacing:4.6px;
      text-shadow:0 1px 9px rgba(0,0,0,0.8)">${name}</div>`, 118, 22);
}
