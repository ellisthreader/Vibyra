import releaseHero030 from "../../assets/changelog/vibyra-release-0.3.0.webp";
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
  "0.3.0": {
    version: "0.3.0",
    releasedAt: "2026-08-28",
    releasedLabel: "28 August 2026",
    title: "What’s new",
    sectionLabel: "New in this release",
    // The 0.2.9 updater predates changelog receipts, so 0.3.0 needs the same
    // one-release bridge. Dismissal still makes the notes strictly one-time.
    allowUnmarkedLaunch: true,
    hero: {
      src: releaseHero030,
      alt: "Friendly geometric helpers around a newly updated Vibyra terminal",
      caption: "A sharper workspace, safely delivered.",
    },
    features: [
      {
        id: "01",
        title: "Updates finish before your workspace opens.",
        body: "Launch now checks, downloads, and installs trusted releases before terminals and projects start, with clear progress and safe recovery controls.",
      },
      {
        id: "02",
        title: "Meet every release properly.",
        body: "After an update, this focused What’s New view introduces the changes once and then gets out of your way.",
      },
      {
        id: "03",
        title: "Projects show their recent story.",
        body: "Right-click a project—or press Shift+F10—to review seven days of Git activity and give the project a clearer name and color.",
      },
      {
        id: "04",
        title: "Closing a project is safer.",
        body: "A two-step close flow makes the effect explicit and protects open work from an accidental click.",
      },
      {
        id: "05",
        title: "Terminal prompts keep their focus.",
        body: "Permission requests, update notices, toasts, and dialogs now return typing to the terminal instead of leaving it unresponsive.",
      },
    ],
  },
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
