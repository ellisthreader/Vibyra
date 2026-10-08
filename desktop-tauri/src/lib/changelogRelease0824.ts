import type { ChangelogEntry } from "./changelogTypes.ts";

export const RELEASE_0824: ChangelogEntry = {
  version: "0.8.24", date: "2026-10-08", image: "/releases/0.8.24.svg",
  summary: "Review Cloud agent allowances and allow separate AI accounts from your Mac.",
  sections: [
    { heading: "Review each Cloud allowance", body: "Choose the Cloud account and model, then review tokens, time, start count and expiry before approving an agent allowance. Refresh or revoke it from the same controls." },
    { heading: "See the work before approving", body: "Cloud task previews show their account, model and cost before a start. Routines, runtime memory and thread recovery keep their controls together." },
    { heading: "Allow an account for Cloud", body: "Settings → Cloud brings Claude and Codex together. Allow opens a fresh provider sign-in just for Cloud; your Mac’s own login stays separate. Stop sign-in cancels an attempt, and turning an account off removes its Cloud access." },
    { heading: "Keep Allow within reach", body: "An approved Cloud connection keeps its Mac account controls available while your phone uses Cloud. New setup still requires a live approved phone. Removed devices and changed accounts lose their previous approval." },
    { heading: "Selected repositories, read only", body: "The GitHub App pilot gives Cloud read access to selected repositories. It does not receive your personal GitHub token, and repository writes remain disabled in this pilot." },
  ],
};
