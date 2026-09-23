import type { ChangelogEntry } from "./changelog";

export const LINUX_RELEASE_082: ChangelogEntry = {
  version: "0.8.2",
  date: "2026-09-23",
  summary: "Google sign-in and bug reports recover from brief service failures. Project actions are on right-click.",
  image: "/releases/0.8.2.svg",
  sections: [
    {
      heading: "Google sign-in stays with you",
      body: "A brief account-service interruption no longer ends an in-progress provider sign-in or loses a completed browser sign-in while Vibyra verifies the session.",
    },
    {
      heading: "Bug reports can be sent",
      body: "Reports now go straight to Vibyra's support service after you press Send. A failed preliminary availability check no longer strands the report.",
    },
    {
      heading: "Project actions on Linux",
      body: "Right-click a project in the sidebar to rename it or close it with confirmation. Closing removes the sidebar entry and sessions while leaving the folder on disk.",
    },
  ],
};
