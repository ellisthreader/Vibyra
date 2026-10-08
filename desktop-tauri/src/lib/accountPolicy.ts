import type { AccountProfile } from "../types";

export type EmailAuthMode = "login" | "signup";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** First initial for the title-bar avatar; email local-part as fallback. */
export function avatarInitial(profile: AccountProfile | null): string {
  const source = profile?.name.trim() || profile?.email.trim() || "";
  const first = source.charAt(0).toUpperCase();
  return /[A-Z0-9]/.test(first) ? first : "•";
}

export function providerDisplayName(provider: string): string {
  if (provider === "google") return "Google";
  if (provider === "apple") return "Apple";
  return "Email";
}

/** Honest inline copy while a browser sign-in is pending. */
export function oauthProgressCopy(provider: string): string {
  return `Finish signing in with ${providerDisplayName(provider)} in your browser.`;
}

/** Only email-provider accounts may change their address in Vibyra. */
export function canEditEmail(profile: AccountProfile | null): boolean {
  return (profile?.provider ?? "email") === "email";
}

/** Client-side validation matching the backend's rules, so obvious mistakes
 * never cost a round trip. Returns null when the form may submit. */
export function validateEmailAuth(
  mode: EmailAuthMode,
  fields: { name: string; email: string; password: string },
): string | null {
  if (mode === "signup" && fields.name.trim().length === 0) {
    return "Enter your name.";
  }
  if (!EMAIL_PATTERN.test(fields.email.trim())) {
    return "Enter a valid email address.";
  }
  if (fields.password.length < 8) {
    return "Use a password of at least eight characters.";
  }
  return null;
}

export function validateProfileEdit(fields: { name: string; email: string }): string | null {
  if (fields.name.trim().length === 0) return "Enter a display name.";
  if (!EMAIL_PATTERN.test(fields.email.trim())) return "Enter a valid email address.";
  return null;
}

/** Copy for the logout confirmation when terminals are still running. */
export function logoutConfirmCopy(runningTerminals: number): string | null {
  if (runningTerminals <= 0) return null;
  const noun = runningTerminals === 1 ? "1 running terminal" : `${runningTerminals} running terminals`;
  return `Logging out closes ${noun} so the next account starts clean.`;
}
