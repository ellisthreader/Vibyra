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
  github: {
    name: 'GitHub',
    path: 'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12',
  },
  // Stripe's mark is the S knocked out of its blurple square — the favicon and the
  // app icon both. Drawn in blurple on our neutral tile it was a purple letter S,
  // which is exactly what an invented placeholder looks like.
  stripe: {
    name: 'Stripe',
    tile: '#635BFF',
    color: '#FFFFFF',
    path: 'M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.594-7.305h.003z',
  },
  // Obsidian's gem is one shape in its own purple (Simple Icons, #7C3AED), which
  // reads on both themes, so it needs no tile.
  obsidian: {
    name: 'Obsidian',
    color: '#7C3AED',
    path: 'M19.355 18.538a68.967 68.959 0 0 0 1.858-2.954.81.81 0 0 0-.062-.9c-.516-.685-1.504-2.075-2.042-3.362-.553-1.321-.636-3.375-.64-4.377a1.707 1.707 0 0 0-.358-1.05l-3.198-4.064a3.744 3.744 0 0 1-.076.543c-.106.503-.307 1.004-.536 1.5-.134.29-.29.6-.446.914l-.31.626c-.516 1.068-.997 2.227-1.132 3.59-.124 1.26.046 2.73.815 4.481.128.011.257.025.386.044a6.363 6.363 0 0 1 3.326 1.505c.916.79 1.744 1.922 2.415 3.5zM8.199 22.569c.073.012.146.02.22.02.78.024 2.095.092 3.16.29.87.16 2.593.64 4.01 1.055 1.083.316 2.198-.548 2.355-1.664.114-.814.33-1.735.725-2.58l-.01.005c-.67-1.87-1.522-3.078-2.416-3.849a5.295 5.295 0 0 0-2.778-1.257c-1.54-.216-2.952.19-3.84.45.532 2.218.368 4.829-1.425 7.531zM5.533 9.938c-.023.1-.056.197-.098.29L2.82 16.059a1.602 1.602 0 0 0 .313 1.772l4.116 4.24c2.103-3.101 1.796-6.02.836-8.3-.728-1.73-1.832-3.081-2.55-3.831zM9.32 14.01c.615-.183 1.606-.465 2.745-.534-.683-1.725-.848-3.233-.716-4.577.154-1.552.7-2.847 1.235-3.95.113-.235.223-.454.328-.664.149-.297.288-.577.419-.86.217-.47.379-.885.46-1.27.08-.38.08-.72-.014-1.043-.095-.325-.297-.675-.68-1.06a1.6 1.6 0 0 0-1.475.36l-4.95 4.452a1.602 1.602 0 0 0-.513.952l-.427 2.83c.672.59 2.328 2.316 3.335 4.711.09.21.175.43.253.653z',
  },
  // Railway's mark is monochrome by design - Simple Icons lists it as #0B0D0E,
  // which is black - so like GitHub it follows the theme rather than being
  // painted a near-black on a dark screen.
  railway: {
    name: 'Railway',
    path: 'M.113 10.27A13.026 13.026 0 000 11.48h18.23c-.064-.125-.15-.237-.235-.347-3.117-4.027-4.793-3.677-7.19-3.78-.8-.034-1.34-.048-4.524-.048-1.704 0-3.555.005-5.358.01-.234.63-.459 1.24-.567 1.737h9.342v1.216H.113v.002zm18.26 2.426H.009c.02.326.05.645.094.961h16.955c.754 0 1.179-.429 1.315-.96zm-17.318 4.28s2.81 6.902 10.93 7.024c4.855 0 9.027-2.883 10.92-7.024H1.056zM11.988 0C7.5 0 3.593 2.466 1.531 6.108l4.75-.005v-.002c3.71 0 3.849.016 4.573.047l.448.016c1.563.052 3.485.22 4.996 1.364.82.621 2.007 1.99 2.712 2.965.654.902.842 1.94.396 2.934-.408.914-1.289 1.458-2.353 1.458H.391s.099.42.249.886h22.748A12.026 12.026 0 0024 12.005C24 5.377 18.621 0 11.988 0z',
  },
  // Figma's mark is five flat shapes in five brand colours, never one colour — a
  // monochrome Figma would read as a different, invented product. Traced from the
  // canonical mark (Wikimedia Commons, upload.wikimedia.org/wikipedia/commons/7/70/Figma.svg,
  // itself the official five-colour logomark) and rescaled from its 7.68-unit grid
  // onto this file's 24x24 viewBox at an exact x3.125, so every coordinate below is
  // that source's own geometry, not redrawn. The mark is naturally taller than wide
  // (2:3), so it sits centred in the square tile rather than stretched to fill it,
  // the same way Figma itself pads it. It ships on a white app-icon tile.
  figma: {
    name: 'Figma',
    tile: '#FFFFFF',
    paths: [
      { fill: '#F24E1E', d: 'M4 4A4 4 0 0 1 8 0h4v8H8a4 4 0 0 1-4-4z' },
      { fill: '#FF7262', d: 'M12 0h4a4 4 0 0 1 0 8H12z' },
      { fill: '#A259FF', d: 'M4 12a4 4 0 0 1 4-4h4v8H8a4 4 0 0 1-4-4z' },
      { fill: '#1ABCFE', d: 'M20 12a4 4 0 0 1-8 0 4 4 0 0 1 8 0z' },
      { fill: '#0ACF83', d: 'M8 24A4 4 0 0 0 12 20V16H8a4 4 0 0 0 0 8z' },
    ],
  },
};

/**
 * The mark for an integration id. An integration we ship no mark for still renders — the
 * title-cased name gives `BrandLogo` an initial to fall back to — so a connector
 * added by the backend never shows up as a blank tile.
 */
export function integrationBrand(id: string): Brand {
  return (
    integrationBrands[id.toLowerCase()] ?? {
      name: id
        .split(/[-_]/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' '),
    }
  );
}
