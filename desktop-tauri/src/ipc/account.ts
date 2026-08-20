import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import type { AccountSnapshot } from "../types";

export function accountRestore(): Promise<AccountSnapshot> {
  return invoke("account_restore");
}

export function accountLoginEmail(email: string, password: string): Promise<AccountSnapshot> {
  return invoke("account_login_email", { email, password });
}

export function accountSignupEmail(
  name: string,
  email: string,
  password: string,
): Promise<AccountSnapshot> {
  return invoke("account_signup_email", { name, email, password });
}

export function accountOauthStart(provider: string): Promise<AccountSnapshot> {
  return invoke("account_oauth_start", { provider });
}

export function accountOauthCancel(): Promise<AccountSnapshot> {
  return invoke("account_oauth_cancel");
}

export function accountProfileRefresh(): Promise<AccountSnapshot> {
  return invoke("account_profile_refresh");
}

export function accountProfileUpdate(name: string, email: string): Promise<AccountSnapshot> {
  return invoke("account_profile_update", { name, email });
}

export function accountPasswordForgot(email: string): Promise<string> {
  return invoke("account_password_forgot", { email });
}

export function accountResendVerification(): Promise<string> {
  return invoke("account_resend_verification");
}

export function accountLogout(): Promise<AccountSnapshot> {
  return invoke("account_logout");
}

export function accountOpenLegal(page: "privacy" | "terms"): Promise<void> {
  return invoke("account_open_legal", { page });
}

export function onAccountChanged(
  callback: (snapshot: AccountSnapshot) => void,
): Promise<UnlistenFn> {
  return listen<AccountSnapshot>("account:changed", (event) => callback(event.payload));
}
