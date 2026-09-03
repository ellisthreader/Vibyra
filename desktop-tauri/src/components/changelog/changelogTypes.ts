/** The shape of one release's notes, shared by the current set and the archive. */
export interface ChangelogFeature {
  id: string;
  title: string;
  body: string;
}

export interface DesktopChangelog {
  version: string;
  releasedAt: string;
  releasedLabel: string;
  title: string;
  sectionLabel: string;
  allowUnmarkedLaunch: boolean;
  /** Optional: a release without bespoke art still shows its notes rather
   *  than being skipped. The notes are the thing that has to arrive. */
  hero?: {
    src: string;
    alt: string;
    caption: string;
  };
  features: ChangelogFeature[];
}
