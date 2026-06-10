const MAX_EMAIL_LENGTH = 320;
const MAX_TOKEN_LENGTH = 512;
const MAX_LINK_LENGTH = 2048;
const DEFAULT_VERIFIED_RECOVERY_URL = "https://links.vibyra.app/reset-password";

export type AuthRecoveryDeepLink = {
  email: string;
  token: string;
};

function isExactRecoveryLocation(parsed: URL): boolean {
  if (parsed.port || parsed.username || parsed.password || parsed.hash) return false;

  if (parsed.protocol === "vibyra:") {
    return parsed.hostname === "reset-password" && parsed.pathname === "";
  }

  const configuredValue = process.env.EXPO_PUBLIC_RECOVERY_LINK_URL?.trim()
    || DEFAULT_VERIFIED_RECOVERY_URL;
  const configured = new URL(configuredValue);
  return configured.protocol === "https:"
    && !configured.port
    && !configured.username
    && !configured.password
    && !configured.search
    && !configured.hash
    && parsed.protocol === configured.protocol
    && parsed.hostname === configured.hostname
    && parsed.pathname === configured.pathname;
}

export function parseAuthRecoveryDeepLink(value?: string | null): AuthRecoveryDeepLink | null {
  if (!value || value.length > MAX_LINK_LENGTH) return null;

  try {
    const parsed = new URL(value);
    if (!isExactRecoveryLocation(parsed)) return null;
    if ([...parsed.searchParams.keys()].some((key) => key !== "email" && key !== "token")) return null;

    const emails = parsed.searchParams.getAll("email");
    const tokens = parsed.searchParams.getAll("token");
    if (emails.length !== 1 || tokens.length !== 1) return null;

    const email = emails[0].trim();
    const token = tokens[0].trim();
    if (!email || email.length > MAX_EMAIL_LENGTH) return null;
    if (!token || token.length > MAX_TOKEN_LENGTH) return null;

    return { email, token };
  } catch {
    return null;
  }
}
