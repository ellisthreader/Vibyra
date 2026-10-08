import { computerName } from "./platform";

/**
 * Every word the Mac's Vibyra Cloud screens say that the iPhone says too, copied verbatim from the phone so the two
 * read as one product. Each group names the phone file it comes from (mobile/src/cloud/…); change both together.
 * Lines marked "Mac only" have no phone counterpart.
 */

/** ConnectCloudPage.tsx `QUESTIONS`: one question per step. */
export const QUESTIONS = {
  projects: { title: "Choose projects for Vibyra Cloud", hint: "Only the projects you select are sent, encrypted." },
  accounts: { title: "Bring your accounts", hint: "Choose what Cloud can use. Sign in from AI accounts after connecting." },
  agree: { title: "Review and connect", hint: `Encrypted on your ${computerName}. Secrets stay home.` },
} as const;

/** ConnectCloudPage.tsx: the title while the projects fly and once they have landed. */
export const FLYING_TITLE = "Syncing…";
export const LANDED_TITLE = "You’re in the cloud.";
/** CloudConsent.tsx: the one consent tick. Its version is the server's CLOUD_CONNECT_CONSENT_VERSION. */
export const CLOUD_CONSENT_VERSION = 3;
export const CLOUD_CONSENT_TEXT = "I agree to the Vibyra Cloud terms. The projects I pick (including uncommitted work) and their agent conversations "
  + `are encrypted on my ${computerName} and stored by Vibyra so only my Vibyra Cloud can read them. Nothing else is sent. Its disk is kept for 30 days `
  + "after it last runs, and it uses my included hours, then tokens.";
export const LEGAL = { terms: "Terms of Service", privacy: "Privacy Policy" } as const;

/** CloudProjectPicks.tsx: an empty Mac, and the count beside the question. */
export const NO_PROJECTS = `No projects on this ${computerName} yet. You can start one in Vibyra Cloud.`;
export const picksCount = (count: number, total: number) => `${count} of ${total}`;
export const SELECT_ALL = "Select all";
export const CLEAR_ALL = "Clear";

/** CloudAccountsStep.tsx: the accounts question's sections and rows. */
export const ACCOUNTS = {
  ai: "AI accounts",
  integrations: "Integrations",
  codexOn: "Sign in once for Vibyra Cloud. Your computer’s login stays separate.",
  claudeOn: "Sign in once for Vibyra Cloud. Your computer’s login stays separate.",
  githubOn: "GitHub access for your Cloud projects.",
  off: "Not available in Vibyra Cloud.",
  githubOff: "Vibyra Cloud gets no GitHub access.",
} as const;

/** ConnectCloudPage.tsx `review`: the last step's summary lines. */
export const REVIEW = { projects: "Projects", accounts: "AI accounts", integrations: "Integrations", edit: "Edit" } as const;
/** connectPlan.ts `projectsLine`: "vibyra-web", "Vibyra, vibyra-web", "4 projects". */
export function projectsLine(names: string[]): string {
  const real = names.map((name) => name.trim()).filter(Boolean);
  return real.length === 0 ? "None yet" : real.length <= 2 ? real.join(", ") : `${real.length} projects`;
}
/** CloudAccountsStep.tsx `accountsLine`: nothing ticked reads "None". */
export const NONE = "None";

/** ConnectCloudPage.tsx / ConnectBar.tsx: the page's buttons. */
export const BUTTONS = { next: "Next", connect: "Connect", connecting: "Connecting", done: "Done", cancel: "Cancel", back: "Back" } as const;

/** The server's refusal codes, as the phone shows them (computerApi.ts messages; `mac_connect_off` is the server's own). */
export const CONNECT_ERRORS: Record<string, string> = {
  mac_connect_off: "Turn on Vibyra Cloud from your iPhone.",
  consent_outdated: "The cloud terms changed. Read them again to connect.",
  host_required: "Turn on iPhone connection in Settings first, then try again.",
  proof_invalid: `Verify this ${computerName} again, then try again.`,
  phone_confirm_required: `Connect your iPhone to this ${computerName} once, or connect to the cloud from your iPhone.`,
};
