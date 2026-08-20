import { SettingRow, type SettingsPaneProps } from "./SettingsShared";

/** Mirrors the structural limits in src-tauri/src/ai_usage_guard.rs. */
const ALWAYS_ON = [
  "One request at a time for chat and one for dictation, so a stuck loop queues instead of fanning out.",
  "About one request a second, and at most 10 a minute.",
  "Chat context is trimmed to 24 messages and 24,000 characters, with replies capped at 1,200 tokens.",
  "Dictation longer than two minutes is cut before it is uploaded.",
];

export function AiLimitsCard({ settings, update }: SettingsPaneProps) {
  return (
    <>
      <div className="settings-group">
        <SettingRow label="Requests a day" hint="Chat and dictation combined. 0 removes this limit.">
          <input
            className="input input--sm"
            type="number"
            min={0}
            max={100000}
            value={settings.aiDailyCallCap}
            onChange={(event) => void update({ aiDailyCallCap: Math.max(0, Number(event.target.value) || 0) })}
          />
        </SettingRow>
        <SettingRow label="Requests an hour" hint="Catches a burst long before the daily budget goes. 0 removes it.">
          <input
            className="input input--sm"
            type="number"
            min={0}
            max={10000}
            value={settings.aiHourlyCallCap}
            onChange={(event) => void update({ aiHourlyCallCap: Math.max(0, Number(event.target.value) || 0) })}
          />
        </SettingRow>
        <SettingRow label="Spend a day (USD)" hint="A request that would cross this is refused before it is sent.">
          <input
            className="input input--sm"
            type="number"
            min={0}
            max={1000}
            step={0.5}
            value={settings.aiDailySpendCapUsd}
            onChange={(event) => void update({ aiDailySpendCapUsd: Math.max(0, Number(event.target.value) || 0) })}
          />
        </SettingRow>
        <SettingRow label="Spend a month (USD)" hint="Your backstop against a bill you did not expect.">
          <input
            className="input input--sm"
            type="number"
            min={0}
            max={10000}
            step={5}
            value={settings.aiMonthlySpendCapUsd}
            onChange={(event) => void update({ aiMonthlySpendCapUsd: Math.max(0, Number(event.target.value) || 0) })}
          />
        </SettingRow>
      </div>
      <div className="ai-guards">
        <span className="ai-guards__title">Always on, whatever the limits above say</span>
        <ul>
          {ALWAYS_ON.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
        <p>
          Counters are kept on disk, so restarting Vibyra does not hand you a
          fresh budget. For a hard ceiling that Vibyra cannot exceed at all, also
          set a monthly budget on your OpenAI billing page.
        </p>
      </div>
    </>
  );
}
