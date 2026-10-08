import { useCallback, useEffect, useState } from "react";

import {
  accountExportOpen,
  accountExportRequest,
  accountExportStatus,
  accountRetention,
  accountRetentionSet,
  type ExportState,
  type RetentionState,
} from "../../ipc/accountPrivacy";
import { useSettingsRefresh } from "../../lib/useSettingsRefresh";
import { SettingRow, SettingsBlock } from "./SettingsShared";

const when = (iso: string) =>
  Number.isNaN(Date.parse(iso)) ? "" : new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function exportHint(state: ExportState): string {
  if (state.status === "queued" || state.status === "building") return "Preparing your archive. This can take a minute.";
  if (state.status === "ready") return `Ready. The link works for ${state.linkExpiresInMinutes ?? 15} minutes after you open it.`;
  if (state.status === "failed") return "The last attempt did not finish. You can try again.";
  if (!state.canRequest && state.nextAllowedAt) return `You can request your data once a day. Next: ${when(state.nextAllowedAt)}.`;
  return "Your profile, settings, chats, projects, teammates, activity and limits as JSON. No passwords or keys.";
}

/**
 * Settings > Account > Your data: "Download my data" and "Keep run history for". Each row is drawn only when the server
 * offers it (a read answers nothing on an older server or with the flag off), so it never shows an empty promise.
 */
export function AccountDataBlock() {
  const [exp, setExp] = useState<ExportState | null>(null);
  const [retention, setRetention] = useState<RetentionState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadExport = useCallback(() => accountExportStatus().then(setExp).catch((cause) => setError(String(cause))), []);
  const reload = useCallback(() => {
    void loadExport();
    void accountRetention().then(setRetention).catch(cause => setError(String(cause)));
  }, [loadExport]);
  useEffect(reload, [reload]);
  useSettingsRefresh(reload, !busy);
  useEffect(() => {
    if (exp?.status !== "queued" && exp?.status !== "building") return undefined;
    const timer = setTimeout(() => void loadExport(), 3000);
    return () => clearTimeout(timer);
  }, [exp, loadExport]);

  const act = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };

  if (!exp && !retention) return error ? <p className="profile-feedback profile-feedback--row profile-feedback--error" role="status">{error}</p> : null;
  const working = exp?.status === "queued" || exp?.status === "building";
  const standard = retention?.serverDays ?? null;
  const current = retention && (retention.days === null || retention.days === standard) ? "default" : String(retention?.days);
  return (
    <SettingsBlock label="Your data" panel="data">
      <div className="settings-group">
        {exp && (
          <SettingRow label="Download my data" hint={exportHint(exp)}>
            {exp.hasLink ? (
              <button className="btn" disabled={busy} onClick={() => void act(accountExportOpen)}>Download</button>
            ) : (
              <button className="btn" disabled={busy || working || !exp.canRequest} onClick={() => void act(async () => setExp(await accountExportRequest()))}>
                {working ? "Preparing…" : "Request"}
              </button>
            )}
          </SettingRow>
        )}
        {retention && (
          <SettingRow label="Keep run history for" hint="Older finished runs lose their step-by-step history. Receipts go when you delete a run's history or your account.">
            <select
              className="input input--sm"
              aria-label="Keep run history for"
              disabled={busy}
              value={current}
              onChange={(event) => void act(async () => setRetention(await accountRetentionSet(event.target.value === "default" ? null : Number(event.target.value))))}
            >
              <option value="default">{standard ? `${standard} days (standard)` : "Standard"}</option>
              {retention.choices.filter((days) => days !== standard).map((days) => (
                <option key={days} value={days}>{days} days</option>
              ))}
            </select>
          </SettingRow>
        )}
        {error && <p className="profile-feedback profile-feedback--row profile-feedback--error" role="status">{error}</p>}
      </div>
    </SettingsBlock>
  );
}
