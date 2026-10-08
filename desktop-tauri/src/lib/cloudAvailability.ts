import type { PhoneStatus } from "../ipc/phone";

/** A remembered device or an online relay is not an authenticated phone socket. */
export function cloudAuthority(account: string | null, statusAccount: string | null, phone: PhoneStatus | null): string | null {
  if (!account || account !== statusAccount || !phone?.enabled) return null;
  const trusted = new Set(phone.devices.map((device) => device.id));
  return phone.active.some((id) => trusted.has(id)) ? account : null;
}

/** Only a native receipt grants management while the phone uses Cloud. */
export function cloudManagementAuthority(account: string | null, statusAccount: string | null, phone: PhoneStatus | null): string | null {
  if (!account || account !== statusAccount || !phone?.enabled) return null;
  return phone.cloudManagement ? `${account}:management:${phone.cloudManagement}` : cloudAuthority(account, statusAccount, phone);
}

/** Revokes captured async authority across disconnect/reconnect, even for the same phone/account. */
export class CloudScope {
  private authority: string | null = null;
  private generation = 0;
  value: string | null = null;

  update(authority: string | null): void {
    if (authority === this.authority) return;
    this.authority = authority;
    this.generation++;
    this.value = authority ? `${authority}:${this.generation}` : null;
  }
}

export function cloudSetupSection(scope: string | null): "cloud" | "iphone" {
  return scope ? "cloud" : "iphone";
}
