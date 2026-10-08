import { useCallback, useEffect, useState } from "react";

import { accountSpendCaps, accountSpendCapsRaise, accountSpendCapsSet } from "../../ipc/spendCaps";
import type { CapKind, SpendCaps, SpendCapsChange } from "../../lib/spendCaps";
import { Segmented } from "./SettingsControls";
import { SettingRow, Switch } from "./SettingsShared";
import { SpendLimitRow } from "./SpendLimitRow";

/** A task is one reply or one agent run, so its sensible sizes are smaller than a day's. */
const TASK_PRESETS = [5, 10, 25];

const zone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
};

/**
 * Spending limits, under the balance. Two limits with thin meters, one per-task limit, one
 * Alerts switch and one line on what is not covered. Every limit is off until the person sets
 * it. Drawn only when the server offers limits, so an older one or the flag being off shows
 * nothing at all. `version` re-reads when the balance moves, so a meter follows a settled reply.
 */
export function AccountSpendLimits({ version }: { version: string }) {
  const [caps, setCaps] = useState<SpendCaps | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    accountSpendCaps().then((next) => live && setCaps(next)).catch(() => live && setCaps(null));
    return () => { live = false; };
  }, [version]);
  const apply = useCallback(async (run: () => Promise<SpendCaps | null>) => {
    setBusy(true);
    setError(null);
    try {
      const next = await run();
      if (next) setCaps(next);
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }, []);
  if (!caps) return null;
  const change = (c: SpendCapsChange) => void apply(() => accountSpendCapsSet({ ...c, timezone: zone() }));
  const raise = (cap: CapKind) => void apply(() => accountSpendCapsRaise(cap));
  const base = (m: SpendCaps["day"]) => (m.limit === null ? null : m.limit - m.raisedBy);
  const hours = caps.cloud.whenHoursRunOut === "default" ? caps.cloud.default : caps.cloud.whenHoursRunOut;
  return (
    <>
      <SettingRow label="Spending limits" hint="Optional, and off until you set one." />
      <SpendLimitRow label="Daily" value={base(caps.day)} presets={caps.presets} max={caps.maxTokens} meter={caps.day}
        busy={busy} raiseFor="today" onChange={(day) => change({ day })} onRaise={() => raise("day")} />
      <SpendLimitRow label="Monthly" value={base(caps.month)} presets={caps.presets} max={caps.maxTokens} meter={caps.month}
        busy={busy} raiseFor="this month" onChange={(month) => change({ month })} onRaise={() => raise("month")} />
      <SpendLimitRow label="Per task" hint="Stop any one task above this many tokens." value={caps.run.limit}
        presets={TASK_PRESETS} max={caps.maxTokens} busy={busy} onChange={(run) => change({ run })} />
      <SettingRow label="Alerts" hint="Tell me at 80% and at 100% of a limit.">
        <Switch label="Spending alerts" checked={caps.alerts} disabled={busy} onChange={(alerts) => change({ alerts })} />
      </SettingRow>
      {caps.cloud.hasIncludedHours && (
        <SettingRow label="When included cloud hours run out">
          <Segmented label="When included cloud hours run out" value={hours} disabled={busy}
            options={[{ id: "tokens", label: "Use tokens" }, { id: "stop", label: "Stop" }]}
            onChange={(cloudIncludedHours) => change({ cloudIncludedHours })} />
        </SettingRow>
      )}
      {error && <p className="profile-feedback profile-feedback--row profile-feedback--error" role="status">{error}</p>}
      <p className="spend-limits__note">
        Limits count Vibyra tokens only. Claude and Codex usage on your own subscription is not covered. A reply already running can finish.
      </p>
    </>
  );
}
