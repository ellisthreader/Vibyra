import { invoke } from "@tauri-apps/api/core";

export interface PhoneDevice {
  id: string;
  name: string;
}

/** `enabled` is the switch; `discoverable` is whether the listener is actually
 * up and advertising on this network, which can lag a Wi-Fi change by a beat. */
export interface PhoneStatus {
  enabled: boolean;
  discoverable: boolean;
  address: string;
  error: string | null;
  devices: PhoneDevice[];
  pending: PhoneDevice[];
  active: string[];
}

export function phoneStatus(): Promise<PhoneStatus> {
  return invoke("phone_status");
}

export function phoneConfigure(enabled: boolean): Promise<PhoneStatus> {
  return invoke("phone_configure", { enabled });
}

export function phoneInvite(): Promise<string> {
  return invoke("phone_invite");
}

export function phoneAnswer(id: string, approve: boolean): Promise<void> {
  return invoke("phone_answer", { id, approve });
}

export function phoneRevoke(id: string): Promise<void> {
  return invoke("phone_revoke", { id });
}
