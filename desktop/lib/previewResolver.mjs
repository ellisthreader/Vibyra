const STATIC_PREVIEW_ENTRIES = [
  "dist/index.html",
  "build/index.html",
  "out/index.html",
  ".output/public/index.html",
  "public/index.html",
  "web/index.html",
  "www/index.html",
  "client/dist/index.html",
  "frontend/dist/index.html",
  "apps/web/dist/index.html",
  "packages/web/dist/index.html",
  "storybook-static/index.html",
  "docs/index.html",
  "game/index.html",
  "demo/index.html",
  "app/index.html",
  "index.html"
];

export { STATIC_PREVIEW_ENTRIES };

export function isSourceOnlyPreviewHtml(html) {
  const scriptTags = html.match(/<script\b[^>]*>/gi) ?? [];
  return scriptTags.some((tag) => {
    const src = tag.match(/\bsrc=["']([^"']+)["']/i)?.[1]?.replace(/^\.?\//, "") ?? "";
    return /^src\/[^?#]+\.(?:jsx?|tsx?)(?:[?#].*)?$/i.test(src)
      || (/\btype=["']module["']/i.test(tag) && /^src\//i.test(src));
  })
    || /@vite\/client|vite\/client/i.test(html);
}
