import type { Brand } from '../ui/brands';

// The marks of the services a person can connect, in the same shape and from the
// same source as the model vendors' — Simple Icons, 24x24 viewBox — so an integration
// row and a model row are drawn by the same `BrandLogo` and read as one product.
// `Brand` is imported rather than re-declared: two copies of one shape drift.
//
// Each is the mark its owner actually ships, including the tile it ships it on.
// A recognisable logo is the difference between a page that looks connected to
// the real services and one that looks like it invented them.
export const integrationBrands: Record<string, Brand> = {
  // GitHub's Invertocat is monochrome by design — black on white, white on black —
  // so it follows the theme exactly as OpenAI and xAI do in `ui/brands`. Simple
  // Icons lists it as #181717, which on a dark screen would paint it a near-black
  // its owner never uses.
  'github': { name: 'GitHub', path: 'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12' },
  // Stripe's mark is the S knocked out of its blurple square — the favicon and the
  // app icon both. Drawn in blurple on our neutral tile it was a purple letter S,
  // which is exactly what an invented placeholder looks like.
  'stripe': { name: 'Stripe', tile: '#635BFF', color: '#FFFFFF', path: 'M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.594-7.305h.003z' },
};

/**
 * The mark for an integration id. An integration we ship no mark for still renders — the
 * title-cased name gives `BrandLogo` an initial to fall back to — so a connector
 * added by the backend never shows up as a blank tile.
 */
export function integrationBrand(id: string): Brand {
  return integrationBrands[id.toLowerCase()]
    ?? { name: id.split(/[-_]/).map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ') };
}
