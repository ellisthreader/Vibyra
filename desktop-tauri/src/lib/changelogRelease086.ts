import type { ChangelogEntry } from "./changelog";

export const RELEASE_086: ChangelogEntry = {
  version: "0.8.6",
  date: "2026-09-24",
  summary: "The full AI desktop, with a terminal ready when you are.",
  image: "/releases/0.8.6.svg",
  sections: [
    {
      heading: "The new-models notice comes to Linux",
      body: "See the same GPT-6 and Claude Opus 5.5 launch notice on Linux, with the same artwork, model details and actions as Mac.",
    },
    {
      heading: "Your terminal is ready when it opens",
      body: "A newly opened terminal now receives keyboard focus. Characters, commands, Backspace and Shift+Tab reach the running CLI in order.",
    },
    {
      heading: "Chat and Agents are included",
      body: "Use Vibyra AI Chat, the Agents roster and conversations, project tools and Preview from the shared desktop workspace on Linux.",
    },
    {
      heading: "The complete 0.8.5 desktop update",
      body: "This Linux update also includes the shared Home and project navigation, project creation, sign-in and report recovery, and the refreshed terminal workspace.",
    },
  ],
};
