import type { ProjectKind } from '../../scaffold/types';

/**
 * A colour per kind. Not decoration: on a nine-cell grid the colour is what the
 * eye lands on before it reads a word, so "Game" is found by its amber long
 * before the label is parsed. Nine hues from one family, so they sit together on
 * the dark ground rather than reading as nine unrelated stickers.
 *
 * `empty` stays grey on purpose — it is the way out of the question, not one of
 * the answers to it.
 */
export const KIND_COLORS: Record<ProjectKind, string> = {
  website: '#4C8DFF',
  webapp: '#6E6BF2',
  mobile: '#2FBF87',
  desktop: '#38B2C4',
  game: '#E07B2C',
  backend: '#C77DFF',
  library: '#C8952A',
  ai: '#FF6B8A',
  empty: '#8A94A6',
};
