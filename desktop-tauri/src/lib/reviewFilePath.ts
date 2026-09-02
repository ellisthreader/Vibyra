// Where a path breaks for a 340px column.
//
// Two decisions, both forced by the width. The name leads: written the other
// way round, every row truncated its folder at a different character, so seven
// filenames started at seven different offsets and the list could not be
// scanned — the one thing a file list has to support. And the folder is only
// its last segment, because a full path has no room to be anything but
// `src/…` or `s…` there, which disambiguates nothing while looking broken.
// The immediate parent is what tells two `index.ts` apart, and it always fits.
//
// Lives here rather than in the component so it can be tested: the runner
// strips types from `.ts`, but cannot load a `.tsx`.

export interface SplitPath {
  /** The immediate parent directory's name. Empty at the repo root. */
  folder: string;
  /** The filename, which the row never truncates. */
  name: string;
}

export function splitPath(path: string): SplitPath {
  const cut = path.lastIndexOf("/");
  if (cut < 0) return { folder: "", name: path };
  const parents = path.slice(0, cut).split("/").filter(Boolean);
  return { folder: parents[parents.length - 1] ?? "", name: path.slice(cut + 1) };
}
