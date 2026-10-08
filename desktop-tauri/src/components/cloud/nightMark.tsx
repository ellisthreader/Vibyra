import { decodeProviderPixelLogo } from "../../assets/providerLogos";

const cache = new Map<string, string | null>();

/** A maker's mark ("openai", "anthropic") drawn for the night sky in either app theme: the app's own icon cache repaints
 *  white marks for the light theme, which would vanish against the Connect page's dark stage. */
function nightMark(maker: string): string | null {
  if (cache.has(maker)) return cache.get(maker)!;
  let url: string | null = null;
  try {
    const logo = decodeProviderPixelLogo(maker);
    const canvas = logo ? document.createElement("canvas") : null;
    const ctx = canvas?.getContext("2d");
    if (logo && canvas && ctx) {
      canvas.width = logo.width; canvas.height = logo.height;
      ctx.putImageData(new ImageData(new Uint8ClampedArray(logo.rgba), logo.width, logo.height), 0, 0);
      url = canvas.toDataURL("image/png");
    }
  } catch { url = null; }
  cache.set(maker, url);
  return url;
}

/** The mark as an image, or the maker's initial on a tile when the app ships no logo for it. */
export function NightMark({ maker, size }: { maker: string; size: number }) {
  const url = nightMark(maker);
  return url
    ? <img className="cc-mark" src={url} alt="" width={size} height={size} />
    : <span className="cc-mark cc-mark--letter" style={{ width: size, height: size }}>{maker.charAt(0).toUpperCase()}</span>;
}
