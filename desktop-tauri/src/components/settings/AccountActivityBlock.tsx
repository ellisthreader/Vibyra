import { useState } from "react";

import { accountActivity, type ActivityItem } from "../../ipc/accountActivity";
import { SettingRow, SettingsBlock } from "./SettingsShared";

const when = (iso: string) =>
  Number.isNaN(Date.parse(iso))
    ? ""
    : new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/**
 * Settings > Account > Activity: sign-ins, devices, keys, webhooks, connections and limits for this
 * account, newest first. Read only, and drawn only when the server offers it (the first read
 * answers nothing on an older server or with the flag off), so it never shows an empty promise.
 */
export function AccountActivityBlock() {
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [offered, setOffered] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (before?: number) => {
    setBusy(true);
    setError(null);
    try {
      const page = await accountActivity(before);
      if (!page) return setOffered(false);
      setItems((prev) => (before ? [...(prev ?? []), ...page.items] : page.items));
      setNext(page.next);
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };

  if (!offered) return null;
  return (
    <SettingsBlock label="Activity" panel="activity">
      <div className="settings-group">
        {items === null ? (
          <SettingRow label="Account activity" hint="Sign-ins, devices, keys, connections and limits.">
            <button className="btn" disabled={busy} onClick={() => void load()}>{busy ? "Loading…" : "Show"}</button>
          </SettingRow>
        ) : items.length === 0 ? (
          <SettingRow label="Nothing recorded yet" />
        ) : (
          items.map((item) => (
            <SettingRow key={item.id} label={item.title} hint={[when(item.createdAt), item.detail].filter(Boolean).join(" · ")} />
          ))
        )}
        {next !== null && (
          <SettingRow label="Older activity">
            <button className="btn" disabled={busy} onClick={() => void load(next)}>{busy ? "Loading…" : "Show more"}</button>
          </SettingRow>
        )}
        {error && <p className="profile-feedback profile-feedback--row profile-feedback--error" role="status">{error}</p>}
      </div>
    </SettingsBlock>
  );
}
