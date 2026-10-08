import type { ChangelogEntry } from "./changelogTypes.ts";

export const RELEASE_0816: ChangelogEntry = {
    version: "0.8.16", date: "2026-09-29", image: "/releases/0.8.16.svg",
    summary: "Approve your devices and stay in control of remote access.",
    sections: [
      { heading: "Stronger remote sign-in", body: "Cloud connections require an approved device, a recent passkey verification and a short-lived session for this computer." },
      { heading: "See and stop access", body: "Security settings show devices, active sessions and recent activity. A persistent Mac indicator stays visible during remote access, with a disconnect action." },
      { heading: "Permissions you choose", body: "Screen viewing, mouse, keyboard, terminal and file access are checked separately. Disable access or revoke a device whenever you need to." },
    ],
  };
