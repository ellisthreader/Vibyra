const RELATIVE_IMAGE_RE = /<img\b([^>]*)\bsrc\s*=\s*("|')(?!https?:|data:|blob:|\/\/|about:|#)([^"']*?)\2([^>]*)>/gi;
const LOCAL_CSS_URL_RE = /url\(\s*(["']?)(?!https?:|data:|blob:|\/\/|about:|#)([^"')]+)\1\s*\)/gi;
const MISSING_ASSET_DATA_URI = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#21163a"/><stop offset="1" stop-color="#0b0d17"/></linearGradient></defs><rect width="960" height="540" fill="url(#g)"/><path d="M120 404 302 242l118 102 78-70 342 130v46H120z" fill="#8e3cff" opacity=".42"/><circle cx="690" cy="170" r="58" fill="#d7c4ff" opacity=".72"/><text x="480" y="478" fill="#efe8ff" font-family="Inter,Arial,sans-serif" font-size="34" font-weight="700" text-anchor="middle">Image asset not included</text></svg>')}`;

export function replaceMissingAssets(html: string) {
  return html
    .replace(RELATIVE_IMAGE_RE, (_match, before, quote, value, after) => {
      const alt = /(?:^|\s)alt\s*=/i.test(`${before}${after}`) ? "" : ` alt="Missing generated asset: ${escapeAttribute(value)}"`;
      return `<img${before}src=${quote}${MISSING_ASSET_DATA_URI}${quote}${alt}${after}>`;
    })
    .replace(LOCAL_CSS_URL_RE, `url("${MISSING_ASSET_DATA_URI}")`);
}

function escapeAttribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
