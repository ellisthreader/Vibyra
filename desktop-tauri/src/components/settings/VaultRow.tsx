import { SettingRow } from "./SettingsShared";
import type { PhoneStatus } from "../../ipc/phone";
import { usePhoneStore } from "../../state/phoneStore";

/** A folder read out to an allowed phone, read-only, whether or not typing is
 * on: it is a separate grant from typing, the way the plan for it distinguishes
 * "read a note" from "run anything this Mac's user can". Choosing does not
 * itself turn the iPhone connection on. */
export function VaultRow({ vault, busy }: { vault: PhoneStatus["vault"]; busy: boolean }) {
  const chooseVault = usePhoneStore((state) => state.chooseVault);
  const clearVault = usePhoneStore((state) => state.clearVault);
  const path = vault?.path ?? null;
  const name = path?.split("/").filter(Boolean).pop() ?? path;
  return <SettingRow label="Vault folder"
    hint={path
      ? `Your iPhone can read notes from "${name}", read-only, and search them from a chat. It cannot change anything in it.`
      : "Let your iPhone read a folder of notes - an Obsidian vault or any folder of markdown - and search it from a chat. Nothing here can be changed from a phone."}>
    {path
      ? <button className="btn" type="button" disabled={busy} onClick={() => void clearVault()}>Stop sharing</button>
      : <button className="btn" type="button" disabled={busy} onClick={() => void chooseVault()}>Choose folder…</button>}
  </SettingRow>;
}
