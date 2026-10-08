import type { ChangelogEntry } from "./changelogTypes.ts";

export const RELEASE_0823: ChangelogEntry = {
  version: "0.8.23", date: "2026-10-08", image: "/releases/0.8.23.svg",
  summary: "Cloud gets its own AI accounts, with clear approval on your Mac.",
  sections: [
    { heading: "Allow an account for Cloud", body: "Settings → Cloud shows Claude and Codex together. Choose Allow to open the provider’s approval page and create a login just for Cloud. Your Mac’s own login stays separate." },
    { heading: "See what Cloud can use", body: "Each account shows its current status, with Allow to reconnect. Stop sign-in cancels an in-progress attempt; turn an account off to remove its Cloud access. Your phone points to these Mac controls when a Cloud account needs attention." },
    { heading: "Selected repositories, read only", body: "The GitHub App pilot grants Cloud read access to selected repositories. Cloud does not receive your personal GitHub token, and repository writes remain disabled in this pilot." },
    { heading: "Safer reconnects and updates", body: "Cloud login and upload updates are checked against the current computer generation. An old connection cannot acknowledge or remove a newer login while Cloud reconnects." },
  ],
};
