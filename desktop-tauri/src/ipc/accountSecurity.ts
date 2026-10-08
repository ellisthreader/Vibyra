import { invoke } from "@tauri-apps/api/core";

import type { AccountDevice, TwoFactorState } from "../types";

export type SecurityMethod = "totp" | "sms" | "email";
export interface SecurityEnrollment {
  enrollmentId: string; method: SecurityMethod; secret: string | null; uri: string | null; account: string;
}
export interface SecurityDelivery { method: SecurityMethod; destination: string | null; codeSent: boolean }
export function twoFactorDelivery(send = false): Promise<SecurityDelivery> {
  return invoke("account_two_factor_delivery", { send });
}
export function twoFactorSendCode(): Promise<void> { return invoke("account_two_factor_code"); }
export function twoFactorMethodStart(method: SecurityMethod, phoneNumber: string, currentCode: string): Promise<SecurityEnrollment> {
  return invoke("account_two_factor_method_start", { method, phoneNumber, currentCode });
}
export function twoFactorMethodResend(enrollmentId: string): Promise<void> {
  return invoke("account_two_factor_method_code", { enrollmentId });
}
export function twoFactorMethodConfirm(enrollmentId: string, code: string): Promise<string[]> {
  return invoke("account_two_factor_method_confirm", { enrollmentId, code });
}

/** The second factor, and every device this account is signed in on. The
 * bearer token stays native: these name values, never routes. */

export function twoFactorStatus(): Promise<TwoFactorState> {
  return invoke("account_two_factor_status");
}

export function twoFactorReplaceRecoveryCodes(code: string): Promise<string[]> {
  return invoke("account_two_factor_recovery_codes", { code });
}

export function twoFactorDisable(code: string): Promise<void> {
  return invoke("account_two_factor_disable", { code });
}

/** Opens Apple's or Google's own security page, for an account whose second
 * step belongs to them. The renderer names a provider, never an address. */
export function accountProviderSecurity(provider: string): Promise<void> {
  return invoke("account_provider_security", { provider });
}

export function accountDevices(): Promise<AccountDevice[]> {
  return invoke("account_devices");
}

/** `signedOut` is true when the device signed out was this Mac. */
export function accountDeviceRevoke(device: string): Promise<{ signedOut: boolean }> {
  return invoke("account_device_revoke", { device });
}

export function accountDevicesRevokeAll(): Promise<{ signedOut: boolean }> {
  return invoke("account_devices_revoke_all");
}

export function accountDeleteWithPassword(password: string): Promise<void> {
  return invoke("account_delete_with_password", { password });
}

/** Resolves when the provider confirms, the attempt expires, or it is
 * cancelled from here — so it is awaited for as long as that takes. */
export function accountDeleteWithProvider(provider: string): Promise<void> {
  return invoke("account_delete_with_provider", { provider });
}

export function accountDeleteCancel(): Promise<void> {
  return invoke("account_delete_cancel");
}
