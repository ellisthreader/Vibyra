import type { TwoFactorPrompt, TwoFactorSetup, TwoFactorState } from '../account/twoFactorApi';
/** The signed-in person as every screen sees them, and the onboarding they came through. */
export type OnboardingMode = 'computer' | 'phone';
export interface OnboardingState { status: 'unknown' | 'pending' | 'complete'; mode: OnboardingMode | null }
export interface Account { email: string; name: string; plan: string; avatarUrl?: string | null;
  provider?: 'email' | 'apple' | 'google' | 'github'; emailVerified?: boolean;
  /** Whether the account asks for a code as well as its password, when the server says. */
  twoFactorEnabled?: boolean;
  /** When the account was made, and how its plan is billed — present only when the server sends them. */
  createdAt?: string; planBillingCycle?: 'monthly' | 'annual'; planRenewsAt?: string | null; membershipEndsAt?: string | null;
  membershipCancelAtPeriodEnd?: boolean; billingProvider?: string | null; canManageStripeBilling?: boolean }
export type { TwoFactorPrompt, TwoFactorSetup, TwoFactorState };
/** One place the account is signed in: a phone, a computer or a browser. */
export interface AccountDevice { id: string; name: string; location: string; current: boolean; lastActive: string | null }
/** How an account proves it is theirs before it is deleted: its password, or its provider again. */
export type AccountDeletion = { password: string } | { provider: 'apple' | 'google' | 'github' };
