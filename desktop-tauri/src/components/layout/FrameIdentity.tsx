import { vibyraLogoUrl } from "../../assets/vibyraLogo";
import { keyLabel } from "../../lib/platform";
import { membershipView } from "../../lib/membership";
import { useAccountStore } from "../../state/accountStore";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { SearchIcon } from "../common/Icons";

/** Whose workspace this is, read from the signed-in account. */
function workspaceName(name: string | undefined, email: string | undefined): string {
  const first = (name || "").trim().split(/\s+/)[0];
  if (first) return `${first}'s workspace`;
  return email ? `${email.split("@")[0]}'s workspace` : "Your workspace";
}

/** The top of every sidebar: the account's workspace (opens Account settings)
 * and the ⌘K search that opens the command palette. */
export function FrameIdentity({ search = true }: { search?: boolean }) {
  const profile = useAccountStore((s) => s.snapshot.profile);
  const plan = membershipView(profile ?? null).plan;
  return <div className="frame-identity">
    <button type="button" className="frame-identity__account" title="Account"
      onClick={() => useWorkspaceStore.getState().openSettingsSection("account")}>
      <span className="frame-identity__logo" aria-hidden="true"><img src={vibyraLogoUrl} alt="" /></span>
      <span className="frame-identity__copy">
        <strong>{workspaceName(profile?.name, profile?.email)}</strong>
        <small>{plan}</small>
      </span>
    </button>
    {search && <button type="button" className="frame-search" aria-label="Search"
      onClick={() => useWorkspaceStore.getState().setPaletteOpen(true)}>
      <SearchIcon size={13} />
      <span>Search</span>
      <kbd>{keyLabel("Mod+K")}</kbd>
    </button>}
  </div>;
}
