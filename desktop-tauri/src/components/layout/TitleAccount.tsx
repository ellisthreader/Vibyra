import { useAccountStore } from "../../state/accountStore";
import { useWorkspaceStore } from "../../state/workspaceStore";

/** The signed-in person's initial; opens Account settings. */
export function TitleAccount() {
  const profile = useAccountStore((s) => s.snapshot.profile);
  if (!profile) return null;
  const initial = (profile.name || profile.email).trim().charAt(0).toUpperCase() || "·";
  return <button type="button" className="title-account" aria-label={`Account, ${profile.name || profile.email}`}
    title="Account" onClick={() => useWorkspaceStore.getState().openSettingsSection("account")}>{initial}</button>;
}
