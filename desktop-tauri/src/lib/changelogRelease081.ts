import type { ChangelogEntry } from "./changelog";

export const LINUX_RELEASE_081: ChangelogEntry = {
  version: "0.8.1",
  date: "2026-09-23",
  summary: "Sorry for the errors in 0.8.0. This release repairs Linux terminal input and window controls.",
  image: "/releases/0.8.1.svg",
  sections: [
    {
      heading: "Typing works in order",
      body:
        "Keystrokes, pasted text, Backspace, and Enter now reach each terminal "
        + "in the order you typed them. This fixes missing or delayed characters "
        + "in regular panes and shared CLI conversations.",
    },
    {
      heading: "Linux window controls",
      body:
        "The window now uses your Linux desktop's native title bar and window "
        + "buttons instead of Mac-style traffic lights inside the app.",
    },
    {
      heading: "Plan mode and bug reports",
      body:
        "Shift+Tab now reaches the CLI's mode switch on Linux. Report Bug is "
        + "easy to find and sends reports through Vibyra's support service.",
    },
  ],
};
