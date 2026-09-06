import type { DesktopChangelog } from "./changelogTypes";

export const release060: DesktopChangelog = {
  version: "0.6.0",
  releasedAt: "2026-09-06",
  releasedLabel: "6 September 2026",
  title: "What’s new",
  sectionLabel: "New in this release",
  allowUnmarkedLaunch: false,
  features: [
    { id: "01", title: "Your tasks have a history.",
      body: "Find active and recent Agent tasks, inspect their instructions and saved results, and return to the conversation. Interrupted work is recovered without silently running it again." },
    { id: "02", title: "Decisions follow the task’s access.",
      body: "Approvals are tied to the exact request and current folder access. Revoking access stops affected work, and proposed memories and skills wait for your review." },
    { id: "03", title: "Pick up where you left off.",
      body: "Restore archived chats and teammates, keep drafts per conversation, choose the provider account, and start from an editable task template." },
    { id: "04", title: "GPT-6 Astra joins the model picker.",
      body: "Choose Astra with its own artwork and effort options, including native launch through a connected Codex account." },
  ],
};
