import type { DesktopChangelog } from "./changelogTypes";

export const release063: DesktopChangelog = {
  version: "0.6.3",
  releasedAt: "2026-09-08",
  releasedLabel: "8 September 2026",
  title: "Your teammates are ready to work",
  sectionLabel: "New in this release",
  allowUnmarkedLaunch: false,
  features: [
    { id: "01", title: "Create and configure teammates.",
      body: "Teammate, routine and skill forms accept typing and clicks again. Provider loading and availability are shown before you create a teammate." },
    { id: "02", title: "Save with confidence.",
      body: "Failed saves preserve your draft. Retrying a save avoids duplicate teammates, routines, skills and memories, and skill assignments reflect confirmed saves." },
    { id: "03", title: "Give work a schedule.",
      body: "Daily and chosen-day routines now save and reopen with the correct time. Routines run while Vibyra is open, with their results in chat and task history." },
  ],
};
