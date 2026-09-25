import type { ChangelogEntry } from "./changelog";

export const RELEASE_0810: ChangelogEntry = {
  version: "0.8.10", date: "2026-09-25", image: "/releases/0.8.10.svg",
  summary: "A further fix for delayed Linux terminal text.",
  sections: [
    {
      heading: "Linux terminal rendering",
      body: "Automatic graphics now uses the compatibility compositor. This addresses a remaining delay in how Linux displays terminal text, including in Balanced mode, after the terminal renderer change in 0.8.9.",
    },
  ],
};
