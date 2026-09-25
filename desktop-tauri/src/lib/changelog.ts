// The full changelog ships with the app so What's New stays accurate offline.
import { RELEASE_0810 } from "./changelogRelease0810.ts";
import { RELEASE_089 } from "./changelogRelease089.ts";
import { RELEASE_088 } from "./changelogRelease088.ts";
import { RELEASE_087 } from "./changelogRelease087.ts";
import { RELEASE_086 } from "./changelogRelease086.ts";
import { RELEASE_085 } from "./changelogRelease085.ts";
import { LINUX_RELEASE_080 } from "./changelogRelease080.ts";
import { LINUX_RELEASE_081 } from "./changelogRelease081.ts";
import { LINUX_RELEASE_082 } from "./changelogRelease082.ts";

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

export const CHANGELOG: ChangelogEntry[] = [
  RELEASE_0810,
  RELEASE_089,
  RELEASE_088,
  RELEASE_087,
  RELEASE_086,
  RELEASE_085,
  LINUX_RELEASE_082,
  LINUX_RELEASE_081,
  LINUX_RELEASE_080,
  {
    version: "0.7.9", date: "2026-09-22", image: "/releases/0.7.9.svg",
    summary: "A complete workspace for your AI teammates.",
    sections: [
      { heading: "A calmer Agents workspace", body: "A compact teammate list, clearer conversations, inline approvals and a quiet composer. Small windows switch naturally between the list and conversation." },
      { heading: "Teammates that remember their job", body: "Configure each teammate’s brief, provider, skills, memory and task budget. Drafts and attachments survive navigation and reopening the app." },
      { heading: "Reliable sends and full history", body: "Interrupted sends keep their original identity, balance errors return your draft, and earlier conversations remain accessible. New replies no longer pull you away from the history you are reading." },
    ],
  },
  {
    version: "0.7.8",
    date: "2026-09-21",
    summary: "Signing in, signing out, and the account your agents actually use.",
    image: "/releases/0.7.8.svg",
    sections: [
      {
        heading: "Two-step sign-in",
        body:
          "Accounts with two-factor authentication can now complete sign-in on "
          + "the Mac: enter the code, or back out of it, without being stranded "
          + "on a screen that could not finish.",
      },
      {
        heading: "Signing out actually ends the session",
        body:
          "Signing this Mac out from Devices, or deleting your account, now "
          + "returns the app to the sign-in screen instead of leaving it sitting "
          + "in a session that no longer exists.",
      },
      {
        heading: "One account's terminals never reach the next",
        body:
          "A saved session holds the departing account's terminals, and with "
          + "scrollback saving on, their output too. That session is now "
          + "discarded on sign-out, so nothing can be restored into whoever "
          + "signs in next.",
      },
      {
        heading: "Launch setup shows the account it will use",
        body:
          "The provider account named in Launch setup is now guaranteed to be "
          + "the one handed to the agent, so a project that picked its own "
          + "account cannot quietly start under a different one.",
      },
      {
        heading: "App notices stop collapsing into a count",
        body:
          "System notices are separate sentences rather than N of one event, so "
          + "two arriving together no longer replace each other with “2 app "
          + "notices” and lose what they said.",
      },
    ],
  },
  {
    version: "0.7.7",
    date: "2026-09-21",
    summary: "A quieter updater, and this window.",
    image: "/releases/0.7.7.svg",
    sections: [
      {
        heading: "One update notice, not three",
        body:
          "An update used to announce itself three times at once — a banner, a "
          + "toast saying it was available, and another saying it was ready — all "
          + "stacked over each other in the same corner. There is now a single "
          + "card that tracks the download and stays until you close it.",
      },
      {
        heading: "You can see what changed",
        body:
          "Every update now opens this window once, describing what is actually "
          + "in the build you just installed. It travels inside the release, so it "
          + "works offline and cannot drift from what shipped.",
      },
    ],
  },
  {
    version: "0.7.6",
    date: "2026-09-21",
    summary: "The first Mac release since 0.1.10, and the biggest one so far.",
    sections: [
      {
        heading: "Every project stays in view",
        body:
          "The sidebar no longer hides the projects you are not looking at. Each "
          + "one keeps its own sessions, expands on its own, and stays where you "
          + "left it — so moving between two pieces of work is one click, not a "
          + "trip back through a picker.",
      },
      {
        heading: "Settings you can actually find things in",
        body:
          "Settings is now tiles with search over the top, and the rarely-needed "
          + "controls have moved into Advanced instead of crowding the page you "
          + "open every day.",
      },
      {
        heading: "Talk to it",
        body:
          "Dictation in chat, using the microphone permission the app already "
          + "asks for. Recording starts only when you press the button.",
      },
      {
        heading: "Your Mac terminals, on your phone",
        body:
          "Conversations started on the Mac carry over to the iOS app, over an "
          + "encrypted connection you pair with a QR code. Open Settings › iPhone "
          + "connection to set it up.",
      },
      {
        heading: "Updates that keep their permissions",
        body:
          "This build is signed with a Developer ID certificate rather than an "
          + "ad-hoc one, so Screen Recording and microphone access now survive an "
          + "update instead of needing to be granted again each time.",
      },
    ],
  },
];

/** The entry for a version, or undefined for a build with nothing written up. */
export function entryFor(version: string): ChangelogEntry | undefined {
  return CHANGELOG.find((entry) => entry.version === version);
}

/**
 * Whether this launch should open the window.
 *
 * Only after an actual upgrade: a first-ever launch has nothing to be new
 * relative to, and greeting a brand-new user with a changelog for software
 * they have never seen is noise. An unknown `seen` value is therefore treated
 * as "show nothing, remember this version".
 */
export function shouldOpen(
  current: string,
  seen: string | null,
  usedBefore = false,
): boolean {
  if (current === seen) return false;
  // No record has two meanings, and reading it as "new install" silently
  // skipped the window for everyone upgrading from a build that predated it —
  // which, on the release that introduces it, is every existing user. So an
  // absent record only means "new install" when nothing else has been stored
  // either. `usedBefore` is what tells the two apart.
  if ((seen === null || seen === "") && !usedBefore) return false;
  return entryFor(current) !== undefined;
}

/** Long dateline, matching the window's title block. */
export function formatDate(iso: string): string {
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
