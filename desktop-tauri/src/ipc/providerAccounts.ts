import { invoke } from "@tauri-apps/api/core";

import type { ProviderIntegration } from "../providerTypes";

// Every call names the account as well as the provider: one company can hold
// several logins, so "disconnect OpenAI" is no longer a thing the user means.

export function listProviderAccounts(): Promise<ProviderIntegration[]> {
  return invoke("provider_accounts");
}

export function connectProviderAccount(
  provider: string,
  account: string,
): Promise<ProviderIntegration[]> {
  return invoke("connect_provider_account", { provider, account });
}

/** Creates another account for a company and starts its sign-in. */
export function addProviderAccount(provider: string): Promise<ProviderIntegration[]> {
  return invoke("add_provider_account", { provider });
}

/** Signs an account out, then forgets it and deletes its folder. */
export function removeProviderAccount(
  provider: string,
  account: string,
): Promise<ProviderIntegration[]> {
  return invoke("remove_provider_account", { provider, account });
}

export function installProviderCli(provider: string): Promise<ProviderIntegration[]> {
  return invoke("install_provider_cli", { provider });
}

export function submitProviderAccountInput(
  provider: string,
  account: string,
  value: string,
): Promise<ProviderIntegration[]> {
  return invoke("submit_provider_account_input", { provider, account, value });
}

export function cancelProviderAccount(
  provider: string,
  account: string,
): Promise<ProviderIntegration[]> {
  return invoke("cancel_provider_account", { provider, account });
}

export function openProviderSignInPage(provider: string, account: string): Promise<void> {
  return invoke("open_provider_sign_in_page", { provider, account });
}

export function disconnectProviderAccount(
  provider: string,
  account: string,
): Promise<ProviderIntegration[]> {
  return invoke("disconnect_provider_account", { provider, account });
}
