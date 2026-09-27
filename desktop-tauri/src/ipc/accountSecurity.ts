import { invoke } from "@tauri-apps/api/core";

import type { AccountDevice, TwoFactorSetup, TwoFactorState } from "../types";

/** The second factor, and every device this account is signed in on. The
 * bearer token stays native: these name values, never routes. */

export function twoFactorStatus(): Promise<TwoFactorState> {
  return invoke("account_two_factor_status");
}

/** Starts a setup. The secret travels once, here, and never again. */
export function twoFactorStart(): Promise<TwoFactorSetup> {
  return invoke("account_two_factor_start");
}

/** Confirms the setup and returns the recovery codes: the only sight of them. */
export function twoFactorConfirm(code: string): Promise<string[]> {
  return invoke("account_two_factor_confirm", { code });
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
