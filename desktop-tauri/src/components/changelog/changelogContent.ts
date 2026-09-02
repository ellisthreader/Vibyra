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
  /** Optional: a release without bespoke art still shows its notes rather
   *  than being skipped. The notes are the thing that has to arrive. */
  hero?: {
    src: string;
    alt: string;
    caption: string;
  };
  features: ChangelogFeature[];
}

const releases: Record<string, DesktopChangelog> = {
  "0.4.2": {
    version: "0.4.2",
    releasedAt: "2026-09-02",
    releasedLabel: "2 September 2026",
    title: "What’s new",
    sectionLabel: "New in this release",
    allowUnmarkedLaunch: false,
    features: [
      {
        id: "01",
        title: "Start a real project from Vibyra.",
        body: "New Project now guides you through the kind, stack, options and destination, shows the exact scaffold command, and opens the completed project in your workspace." },
      {
        id: "02",
        title: "Busy terminals no longer freeze the workspace.",
        body: "Terminal output now follows what the renderer actually paints, background panes are paced on compatibility graphics, and generated folders no longer flood the file watcher." },
      {
        id: "03",
        title: "Agent and Chat are clearly work in progress.",
        body: "Both modes stay visible with a WIP label but cannot be opened yet. Shortcuts, notifications and remembered state all return safely to Code." },
      {
        id: "04",
        title: "Fable 5.1 has its own face.",
        body: "Claude Fable 5.1 now has distinct artwork that matches the rest of the model wall instead of borrowing Fable 5’s icon.",
      },
    ],
  },
  "0.4.1": {
    version: "0.4.1",
    releasedAt: "2026-09-01",
    releasedLabel: "1 September 2026",
    title: "What’s new",
    sectionLabel: "New in this release",
    allowUnmarkedLaunch: false,
    features: [
      {
        id: "01",
        title: "Claude Fable 5.1 is here.",
        body: "Anthropic’s most capable widely released model sits at the top of the Anthropic wall. With a connected Claude account it runs natively, with the full effort ladder from Low to Max — and Ultracode.",
      },
    ],
  },
  "0.4.0": {
    version: "0.4.0",
    releasedAt: "2026-09-01",
    releasedLabel: "1 September 2026",
    title: "What’s new",
    sectionLabel: "New in this release",
    // 0.3.5 shipped without an entry here, so the release before this one
    // introduced itself with nothing. Everyone arriving from it is unmarked.
    allowUnmarkedLaunch: true,
    features: [
      {
        id: "01",
        title: "Ask can see your workspace.",
        body: "The dock’s Chat panel is now Ask, briefed on live pane status, spend, settings and your vault notes. Credentials are stripped before anything is sent, and the panel says how many were removed.",
      },
      {
        id: "02",
        title: "Ask listens, and answers out loud.",
        body: "Speak into the composer and hear the reply. One ring shows who is talking — cobalt for you, violet for Vibyra — and both are real readings, not decoration.",
      },
      {
        id: "03",
        title: "Agent Mode reads like a conversation.",
        body: "Answers now render properly instead of arriving as raw characters: headings, lists and code blocks you can copy. Every turn ends with what it cost, and Copy, Retry and Edit & resend.",
      },
      {
        id: "04",
        title: "See what an agent changed.",
        body: "Files a teammate touched open into a real diff, and tool calls read as what they did, to what, and how it went — so the one that failed is findable at a glance.",
      },
      {
        id: "05",
        title: "Unattended work reports itself.",
        body: "Routines show their last dozen runs, why a failure failed, and a way into the chat each one opened. Skills that shaped an answer are named above it, at the version that ran.",
      },
      {
        id: "06",
        title: "A decision finds you anywhere.",
        body: "Waiting decisions and failed routines now reach you in Code Mode, with a count on the Agent button. A routine that simply worked stays silent.",
      },
      {
        id: "07",
        title: "Switching modes no longer drags.",
        body: "Leaving Code Mode now tells your terminals they are off screen. They were still streaming at full rate behind the scenes, which is what made switching slow and could push the renderer into its fallback.",
      },
      {
        id: "08",
        title: "The 0.3.0 work is back.",
        body: "Startup shows a splash again, project activity and safer project closing return, and the GitHub probe once more scrubs automation tokens before running gh.",
      },
    ],
  },
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
