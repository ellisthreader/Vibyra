import type { ChangelogEntry } from "./changelogTypes.ts";

export const RELEASE_0818: ChangelogEntry = {
  version: "0.8.18", date: "2026-10-02", image: "/releases/0.8.18.svg",
  summary: "Vibyra tokens, reliable project setup and safer account updates.",
  sections: [
    { heading: "Chat and voice with Vibyra tokens", body: "Built-in chat, dictation and spoken replies use your Vibyra token balance. No personal OpenAI key is needed." },
    { heading: "Keep your workspace", body: "An incorrect password during an email change no longer signs you out or closes your terminals. Selecting Terminal in Settings closes temporary chat previews." },
    { heading: "Clear plan access", body: "Your account shows token balances and available top-ups. Workspace limits explain when Pro is needed while keeping your projects saved." },
    { heading: "Projects that start correctly", body: "Project creation checks your installed tools, preserves generated app files, and installs the dependencies needed for supported templates." },
    { heading: "Reliable account screens", body: "Account confirmation keeps its keyboard focus while you type, and browser identity checks stay bound to their original request." },
  ],
};
