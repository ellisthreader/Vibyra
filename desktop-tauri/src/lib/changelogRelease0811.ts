import type { ChangelogEntry } from "./changelog";

export const RELEASE_0811: ChangelogEntry = {
  version: "0.8.11",
  date: "2026-09-26",
  image: "/releases/0.8.11.svg",
  summary: "A clear choice about optional usage analytics.",
  sections: [
    {
      heading: "You decide what to share",
      body: "On your first signed-in visit, choose aggregate usage, account-linked usage, or decline. You can change your choice in Settings > Privacy at any time.",
    },
    {
      heading: "Useful counts without your work",
      body: "When enabled, Vibyra counts app use, projects, Preview opens, agent prompts by model and engaged time. Your prompt text, terminal output, project names, and file paths stay out of these events.",
    },
    {
      heading: "Clearer phone approvals",
      body: "Command and network requests show their exact scope on your iPhone. A Codex rule can be remembered only when Codex offered that specific rule for the current request.",
    },
    {
      heading: "Saved Codex work opens reliably",
      body: "The Mac keeps your chosen agent view when opening previews or starting work from your phone, and explains when an older Codex session cannot resume.",
    },
  ],
};
