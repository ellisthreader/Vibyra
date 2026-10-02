// The Vibyra account as the renderer sees it: who is signed in, what they
// pay for, and how it is protected. Mirrors the serde shapes in
// src-tauri/src/account_*.rs; the bearer token has no shape here on purpose.

export type AccountStatus =
  | "restoring"
  | "signedOut"
  | "authorizing"
  /** The password was right and the account also asks for a code. */
  | "twoFactor"
  | "signedIn"
  | "connectionError";

export interface AccountProfile {
  licenseRedemptionStatus?: string | null;
  license?: { tokens: number; allowance: "once" | "monthly"; endsAt: string; nextAt: string | null; betaWelcome?: { id: string; months: number | null } | null } | null;
  name: string;
  email: string;
  provider: string;
  plan: string;
  emailVerified: boolean;
  welcomeKey: string;
  twoFactorEnabled: boolean;
  createdAt: string | null;
  planBillingCycle: "monthly" | "annual";
  planRenewsAt: string | null;
  creditsResetAt: string | null;
  /** The paid-through date, which is what a cancellation runs to. */
  membershipEndsAt: string | null;
  membershipCancelAtPeriodEnd: boolean;
  /** `stripe`, `iap-apple`, `iap-google`, or null on a free account. */
  billingProvider: string | null;
  canManageStripeBilling: boolean;
  hasAvatar: boolean;
  /** Free or Pro workspace limits; every limit is open until `enforced`. */
  planLimits: PlanLimits;
}

/** What this account's plan allows, as the account service states it. The
 * Mac's native commands enforce terminals and Safe mode; the server enforces
 * Agents and Vibyra Cloud. The renderer only shows the state. */
export interface PlanLimits {
  enforced: boolean;
  plan: string;
  /** On the free Pro trial, which ends at `paidUntil`. */
  trial: boolean;
  paidUntil: string | null;
  /** Running terminals at once, agent or shell; null is unlimited. */
  maxTerminals: number | null;
  /** Usable projects, oldest first; later ones stay saved but locked. */
  maxProjects: number | null;
  safeWorktrees: boolean;
  preview: boolean;
  review: boolean;
  agents: boolean;
  remoteAccess: boolean;
}

/** One place this account is signed in, as Settings > Account lists it. */
export interface AccountDevice {
  id: string;
  name: string;
  location: string;
  lastActive: string | null;
  current: boolean;
}

export interface TwoFactorState {
  enabled: boolean;
  /** False for an Apple or Google account: that second step is theirs. */
  available: boolean;
  confirmedAt: string | null;
  recoveryCodesLeft: number;
}

/** The one sight of a new secret, when a setup starts. */
export interface TwoFactorSetup {
  secret: string;
  uri: string;
  account: string;
}

/** The account's AI balance, from the versioned Vibes wallet. */
export interface CreditsSummary {
  available: number;
  held: number;
  total: number;
  chatEnabled: boolean;
  purchasesEnabled: boolean;
  paidAvailable?: number;
  promotionalExpiresAt?: string | null;
  freeNextAt?: string | null;
}

export interface TopupOption {
  key: string;
  credits: number;
  pricePence: number;
}

export interface AccountSnapshot {
  status: AccountStatus;
  profile: AccountProfile | null;
  error: string | null;
  pendingProvider: string | null;
  secureStorage: boolean;
}
