import type { ChangelogEntry } from "./changelogTypes.ts";

export const RELEASE_0829: ChangelogEntry = {
  version: "0.8.29", date: "2026-10-09", image: "/releases/0.8.29.svg",
  summary: "Keep independent Agent jobs and reviewed groups together with reliable Cloud accounts.",
  sections: [
    { heading: "Keep your ongoing work", body: "Preserves separate jobs, named groups, reviewed workflows and evidence-based completion from the previous update." },
    { heading: "Accounts stay available in Cloud", body: "Allow Claude and Codex from your Mac while your approved phone works in Cloud. Cloud uses its own accounts and retries safely when its encryption key changes." },
    { heading: "Reliable native launches", body: "Improves Windows provider launches and managed worktree checks while preserving scoped access and the original account boundaries." },
    { heading: "Verified build inputs", body: "Adds reviewed build-tooling and Linux iterator repairs with reproducible source checks." },
  ],
};
