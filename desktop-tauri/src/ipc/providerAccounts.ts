import { invoke } from "@tauri-apps/api/core";

import type { ProviderAccount } from "../types";

export function listProviderAccounts(): Promise<ProviderAccount[]> {
  return invoke("provider_accounts");
}

export function connectProviderAccount(provider: string): Promise<ProviderAccount[]> {
  return invoke("connect_provider_account", { provider });
}

export function cancelProviderAccount(provider: string): Promise<ProviderAccount[]> {
  return invoke("cancel_provider_account", { provider });
}

export function openProviderSignInPage(provider: string): Promise<void> {
  return invoke("open_provider_sign_in_page", { provider });
}

export function disconnectProviderAccount(provider: string): Promise<ProviderAccount[]> {
  return invoke("disconnect_provider_account", { provider });
}
