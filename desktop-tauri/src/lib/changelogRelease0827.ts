import type { ChangelogEntry } from "./changelogTypes.ts";

export const RELEASE_0827: ChangelogEntry = {
  version: "0.8.27", date: "2026-10-08", image: "/releases/0.8.27.svg",
  summary: "Keep your Cloud account controls available while you work from your phone.",
  sections: [
    { heading: "Separate accounts for Cloud", body: "Allow Claude and Codex from Settings → Cloud. Each sign-in belongs to Cloud, while your Mac keeps its own account. The controls stay available when your approved phone switches to Cloud." },
    { heading: "Reviewed repository access", body: "Cloud reads only repositories selected for its GitHub App. Personal GitHub tokens stay off the Cloud computer, and repository writes remain disabled in this pilot." },
    { heading: "Your ongoing work stays with you", body: "Keeps the goals, follow-ups, reviewed proposals and notification controls introduced in the previous update." },
  ],
};
