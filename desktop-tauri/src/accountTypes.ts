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
