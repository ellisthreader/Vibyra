import { useSyncExternalStore } from "react";
import { cloudAuthority, cloudManagementAuthority, CloudScope } from "../lib/cloudAvailability";
import { useAccountStore } from "./accountStore";
import { usePhoneStore } from "./phoneStore";

const scope = new CloudScope();
const setup = new CloudScope();
const listeners = new Set<() => void>();
function update() {
  const account = useAccountStore.getState().snapshot;
  const phone = usePhoneStore.getState();
  const before = scope.value, beforeSetup = setup.value;
  setup.update(cloudAuthority(account.status === "signedIn" ? account.profile?.welcomeKey ?? null : null,
    phone.accountScope, phone.status));
  scope.update(cloudManagementAuthority(account.status === "signedIn" ? account.profile?.welcomeKey ?? null : null,
    phone.accountScope, phone.status));
  if (before !== scope.value || beforeSetup !== setup.value) listeners.forEach((listener) => listener());
}
useAccountStore.subscribe(update);
usePhoneStore.subscribe(update);
update();

export const readCloudScope = () => scope.value;
export const readCloudSetupScope = () => setup.value;
export const useCloudSetupAvailability = () => useSyncExternalStore(subscribe, readCloudSetupScope, () => null);
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export const useCloudAvailability = () => useSyncExternalStore(subscribe, readCloudScope, () => null);
