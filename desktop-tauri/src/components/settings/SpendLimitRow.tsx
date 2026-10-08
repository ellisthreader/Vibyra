import { useState, type FormEvent } from "react";

import { tokens, type SpendMeter } from "../../lib/spendCaps";
import { Segmented } from "./SettingsControls";

/**
 * One limit: its name, Off / presets / Custom as one segmented choice, and while it is on a
 * thin meter reading "used of limit" and when it resets. The meter takes the same two steps
 * of colour the alerts do (80% and 100%). Custom opens a field in place, never a modal.
 * At the limit, the one way forward is offered here: raise it for this period.
 */
export function SpendLimitRow({
  label,
  hint,
  value,
  presets,
  max,
  meter,
  busy,
  raiseFor,
  onChange,
  onRaise,
}: {
  label: string;
  hint?: string;
  /** The base limit the person set (without any raise for this period). */
  value: number | null;
  presets: number[];
  max: number;
  meter?: SpendMeter;
  busy: boolean;
  raiseFor?: "today" | "this month";
  onChange: (value: number | null) => void;
  onRaise?: () => void;
}) {
  const custom = value !== null && !presets.includes(value);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const amount = Number(draft);
  const valid = draft.trim() !== "" && Number.isFinite(amount) && amount >= 1 && amount <= max;
  const choice = typing || custom ? "custom" : value === null ? "off" : String(value);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    setTyping(false);
    onChange(amount);
  };
  const limit = meter?.limit ?? null;
  const share = meter && limit ? Math.min(1, meter.used / limit) : 0;
  const tone = share >= 1 ? " spend-meter--full" : share >= 0.8 ? " ai-meter__fill--high" : "";
  return (
    <div className="spend-row" role="group" aria-label={label}>
      <div className="spend-row__head">
        <div className="setting-row__text">
          <span className="setting-row__label">{label}</span>
          {hint ? <span className="setting-row__hint">{hint}</span> : null}
        </div>
        <Segmented
          label={label}
          value={choice}
          disabled={busy}
          options={[
            { id: "off", label: "Off" },
            ...presets.map((p) => ({ id: String(p), label: String(p) })),
            { id: "custom", label: custom && !typing ? `Custom · ${tokens(value!)}` : "Custom" },
          ]}
          onChange={(next) => {
            if (next === "custom") {
              setDraft(custom ? String(value) : "");
              setTyping(true);
              return;
            }
            setTyping(false);
            onChange(next === "off" ? null : Number(next));
          }}
        />
      </div>
      {typing && (
        <form className="spend-row__custom" onSubmit={submit}>
          <input
            className="input input--sm"
            type="number"
            min={1}
            max={max}
            step="any"
            autoFocus
            aria-label={`${label} custom limit in tokens`}
            placeholder="Tokens"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button className="btn btn--compact" type="submit" disabled={!valid || busy}>Set</button>
        </form>
      )}
      {meter && limit !== null && (
        <>
          <div
            className="ai-meter__track"
            role="meter"
            aria-label={`${label} used`}
            aria-valuemin={0}
            aria-valuemax={limit}
            aria-valuenow={Math.min(meter.used, limit)}
            aria-valuetext={`${tokens(meter.used)} of ${tokens(limit)} tokens used`}
          >
            <span className={`ai-meter__fill${tone}`} style={{ width: `${Math.round(share * 100)}%` }} />
          </div>
          <span className="credits-row__note">
            {tokens(meter.used)} of {tokens(limit)} used · resets {meter.resetsLabel}
            {share >= 1 && onRaise && (
              <>
                {" · "}
                <button className="spend-row__raise" type="button" disabled={busy} onClick={onRaise}>
                  Raise for {raiseFor}
                </button>
              </>
            )}
          </span>
        </>
      )}
    </div>
  );
}
