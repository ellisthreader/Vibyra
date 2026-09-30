import type { ChangelogEntry } from "./changelog";

export const LINUX_RELEASE_080: ChangelogEntry = {
  version: "0.8.0",
  date: "2026-09-23",
  summary: "The Mac desktop experience comes to Linux, with native Linux integration.",
  image: "/releases/0.8.0.png",
  sections: [
    {
      heading: "The same Vibyra workspace",
      body:
        "Projects, agent chats, terminal panes, the sidebar, Settings, and "
        + "the sign-in flow now share the Mac design and bundled artwork on Linux.",
    },
    {
      heading: "Built for Linux",
      body:
        "The window has Linux controls, while sessions, audio dictation, speech, "
        + "and screenshots use native Linux services. The AppImage includes "
        + "the WebKit and media runtime it needs to launch.",
    },
    {
      heading: "Updates inside the app",
      body:
        "Signed AppImage and Debian updates are offered through Vibyra. "
        + "After installing, this changelog and its artwork are available offline.",
    },
    {
      heading: "Wayland keyboard shortcuts",
      body:
        "On Wayland, screenshot and recording shortcuts work while Vibyra "
        + "has focus. Desktop-wide shortcuts still depend on compositor support.",
    },
  ],
};
