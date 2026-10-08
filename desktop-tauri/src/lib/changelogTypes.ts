export interface ChangelogSection {
  heading: string;
  body: string;
}

export interface ChangelogEntry {
  version: string;
  /** ISO date; rendered as the dateline under the title. */
  date: string;
  /** One line under the heading, before the sections. Optional. */
  summary?: string;
  /**
   * Release artwork for the hero band, as a path under `public/`. Optional:
   * without one the band falls back to the version set in type, which is
   * deliberately not the brand mark — the logo is not release art.
   */
  image?: string;
  sections: ChangelogSection[];
}

