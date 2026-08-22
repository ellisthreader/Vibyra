// Wire shapes for the AI account integrations, mirroring the serde
// renames in src-tauri/src/provider_auth_state.rs.
//
// Kept out of types.ts because one company can now hold several logins,
// and the shapes that describe that are a subsystem of their own.

export type ProviderAccountStatus =
  | "connected"
  | "connecting"
  | "installing"
  | "sign-in-required"
  | "not-installed"
  | "error";

export type ProviderId = "codex" | "claude" | "gemini";

export interface ProviderAccount {
  /** Unique within its provider; `"default"` is the CLI's own folder. */
  accountId: string;
  status: ProviderAccountStatus;
  accountLabel: string;
  detail: string;
  signInPageAvailable: boolean;
  /** What the provider CLI is waiting to be told; empty when it is not asking. */
  prompt: string;
  /** False for the first account: it can be signed out but never deleted. */
  removable: boolean;
}

/** One company, with every account held for it. */
export interface ProviderIntegration {
  id: ProviderId;
  company: string;
  product: string;
  runtimeId: string;
  installed: boolean;
  /** npm package the Install action fetches, so the card can name the command. */
  package: string;
  accounts: ProviderAccount[];
  /** False once the per-provider ceiling is reached. */
  canAddAccount: boolean;
}
