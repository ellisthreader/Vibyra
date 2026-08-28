import releaseHero029 from "../../assets/changelog/vibyra-release-0.2.9.webp";

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
  hero: {
    src: string;
    alt: string;
    caption: string;
  };
  features: ChangelogFeature[];
}

const releases: Record<string, DesktopChangelog> = {
  "0.2.9": {
    version: "0.2.9",
    releasedAt: "2026-08-28",
    releasedLabel: "28 August 2026",
    title: "What’s new",
    sectionLabel: "New in this release",
    // The already-released 0.2.8 binary cannot write the new pending receipt.
    // This one-version bridge ensures its 0.2.9 users still see the notes.
    allowUnmarkedLaunch: true,
    hero: {
      src: releaseHero029,
      alt: "Friendly geometric agents celebrating a completed Vibyra update",
      caption: "Fresh tools, ready when you are.",
    },
    features: [
      {
        id: "01",
        title: "Updates finish before work begins.",
        body: "Vibyra can now check, download, and install a trusted release at launch—before terminals or projects are opened.",
      },
      {
        id: "02",
        title: "A calmer, clearer launch.",
        body: "Honest progress, focused retry controls, and an escape path keep every update stage understandable.",
      },
      {
        id: "03",
        title: "Stronger release checks.",
        body: "Signed packages and pre-publish verification help ensure the release you receive is complete and expected.",
      },
    ],
  },
};

export function changelogForVersion(version: string): DesktopChangelog | null {
  return releases[version] ?? null;
}
