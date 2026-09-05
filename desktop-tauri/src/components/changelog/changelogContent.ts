import { archivedReleases } from "./changelogArchive";
import type { DesktopChangelog } from "./changelogTypes";

export type { ChangelogFeature, DesktopChangelog } from "./changelogTypes";

// The releases someone might currently be updating from. Older ones live in
// `changelogArchive`, so this file stays inside the line limit as releases
// accumulate rather than needing a split at the worst possible moment.

const releases: Record<string, DesktopChangelog> = {
  "0.4.4": {
    version: "0.4.4",
    releasedAt: "2026-09-05",
    releasedLabel: "5 September 2026",
    title: "What’s new",
    sectionLabel: "New in this release",
    allowUnmarkedLaunch: false,
    features: [
      {
        id: "01",
        title: "Busy input has a clear limit.",
        body: "Terminal input stays in order with a bounded queue. If a terminal cannot accept more input, Vibyra tells you visibly so you can retry it.",
      },
      {
        id: "02",
        title: "File changes use bounded background work.",
        body: "Large bursts of file activity are grouped into bounded batches, and renamed source folders stay watched. Generated folders remain excluded.",
      },
      {
        id: "03",
        title: "Dictation cleans up after itself.",
        body: "Recordings stop after two minutes. Cancelled recordings release the microphone process and remove their temporary audio.",
      },
    ],
  },
  "0.4.3": {
    version: "0.4.3",
    releasedAt: "2026-09-03",
    releasedLabel: "3 September 2026",
    title: "What’s new",
    sectionLabel: "New in this release",
    allowUnmarkedLaunch: false,
    features: [
      {
        id: "01",
        title: "Agent Mode is open.",
        body: "The title-bar Agent button works. Create a teammate with its own brief, folders and access level, and every chat you have with it shares them — no more WIP label, no more falling back to Code.",
      },
      {
        id: "02",
        title: "Your teammate stops and asks before anything outward.",
        body: "Deleting outside a folder you granted, publishing, spending or touching a secret now pauses the actual work and waits for you in Decisions. The card shows the exact command, and nothing has happened until you answer.",
      },
      {
        id: "03",
        title: "Every Agent screen was rebuilt.",
        body: "Dashboard, Decisions, Routines, Skills and a teammate’s own settings now use the same rows, cards and dialogs as the rest of Vibyra, instead of five different-looking pages.",
      },
      {
        id: "04",
        title: "Chat Mode is open too.",
        body: "A conversation with no project and no folder, until you give it one.",
      },
      {
        id: "05",
        title: "Transcripts show what actually ran.",
        body: "A tool call now reads as its command or its file path rather than raw JSON, and a finished turn reports its cost instead of failing to draw.",
      },
    ],
  },
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
};

export function changelogForVersion(version: string): DesktopChangelog | null {
  return releases[version] ?? archivedReleases[version] ?? null;
}
