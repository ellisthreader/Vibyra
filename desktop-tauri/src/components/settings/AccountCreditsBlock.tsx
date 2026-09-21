import { useCallback, useEffect, useState } from "react";

import { accountBillingTopup, accountCredits, accountTopupOptions } from "../../ipc/accountBilling";
import { longDate, pounds } from "../../lib/membership";
import type { AccountProfile, CreditsSummary, TopupOption } from "../../types";
import { SettingRow } from "./SettingsShared";

/**
 * The account's AI balance, and buying more of it. Rows rather than a block
 * of its own: what you are on and what you have left are one thing, so they
 * share the membership card.
 *
 * The Mac does not spend these — its terminals run on your own provider
 * accounts — which the note says once, without an essay.
 */
export function AccountCredits({
  profile,
  showResetDate,
}: {
  profile: AccountProfile;
  showResetDate: boolean;
}) {
  const [credits, setCredits] = useState<CreditsSummary | null>(null);
  const [topups, setTopups] = useState<TopupOption[]>([]);
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    void accountCredits()
      .then(setCredits)
      .catch((cause) => setError(String(cause)));
  }, []);

  useEffect(() => {
    load();
    void accountTopupOptions().then(setTopups).catch(() => {});
    // A top-up is paid for in the browser, so the balance is re-read when the
    // window comes back rather than on a timer of its own.
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [load]);

  // Nothing at all while the first read is in flight; a plain sentence if it
  // failed, because a missing row reads as a missing feature.
  if (!credits) {
    return error ? (
      <SettingRow label="Credits unavailable" hint={error}>
        <button className="btn" onClick={load}>Try again</button>
      </SettingRow>
    ) : null;
  }

  const resets = showResetDate && profile.creditsResetAt && !Number.isNaN(Date.parse(profile.creditsResetAt))
    ? `Refreshes on ${longDate(profile.creditsResetAt)}. `
    : "";
  const ceiling = Math.max(credits.total, credits.available, 1);
  const fill = Math.min(100, Math.round((credits.available / ceiling) * 100));
  const buy = async (key: string) => {
    setBusy(true);
    setError(null);
    try {
      await accountBillingTopup(key);
      setChoosing(false);
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="credits-row" data-panel="credits">
        <div className="credits-row__head">
          <span className="credits-row__value">{credits.available.toLocaleString()}</span>
          <span className="credits-row__unit">credits left</span>
          {credits.held > 0 && <span className="credits-row__held">{credits.held.toLocaleString()} in flight</span>}
        </div>
        <div
          className="ai-meter__track"
          role="meter"
          aria-label="Credits left"
          aria-valuenow={fill}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span className="ai-meter__fill" style={{ width: `${fill}%` }} />
        </div>
        <span className="credits-row__note">
          {resets}Spent by Vibyra AI and the phone app; Mac terminals use your own accounts.
        </span>
      </div>
      {credits.purchasesEnabled && topups.length > 0 && (
        <SettingRow label="Top up" hint="A one-off purchase, on top of your plan.">
          {!choosing && <button className="btn" onClick={() => setChoosing(true)}>Buy credits</button>}
          {choosing && (
            <div className="credits-topups">
              {topups.map((option) => (
                <button key={option.key} className="btn" disabled={busy} onClick={() => void buy(option.key)}>
                  {option.credits.toLocaleString()} · {pounds(option.pricePence)}
                </button>
              ))}
              <button className="btn" disabled={busy} onClick={() => setChoosing(false)}>Cancel</button>
            </div>
          )}
        </SettingRow>
      )}
      {error && (
        <p className="profile-feedback profile-feedback--row profile-feedback--error" role="status">{error}</p>
      )}
    </>
  );
}
