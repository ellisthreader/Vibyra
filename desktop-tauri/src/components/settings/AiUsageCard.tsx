import { capLabel, meter, minutes, usd } from "../../lib/aiSpend";
import type { AiServiceStatus } from "../../types";

function Meter({ label, used, cap, fill }: { label: string; used: string; cap: string; fill: number }) {
  return (
    <div className="ai-meter">
      <div className="ai-meter__head">
        <span className="ai-meter__label">{label}</span>
        <span className="ai-meter__value">
          {used} <i>/ {cap}</i>
        </span>
      </div>
      <div
        className="ai-meter__track"
        role="meter"
        aria-label={label}
        aria-valuenow={Math.round(fill)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span className={`ai-meter__fill ${fill >= 80 ? "ai-meter__fill--high" : ""}`} style={{ width: `${fill}%` }} />
      </div>
    </div>
  );
}

export function AiUsageCard({ status }: { status: AiServiceStatus }) {
  const { usage, limits, pricing } = status;

  return (
    <article className="settings-group ai-usage">
      <div className="ai-usage__meters">
        <Meter
          label="Requests today"
          used={String(usage.callsToday)}
          cap={capLabel(limits.dailyCalls, String(limits.dailyCalls))}
          fill={meter(usage.callsToday, limits.dailyCalls)}
        />
        <Meter
          label="Spend today"
          used={usd(usage.spendTodayUsd)}
          cap={capLabel(limits.dailySpendUsd, usd(limits.dailySpendUsd))}
          fill={meter(usage.spendTodayUsd, limits.dailySpendUsd)}
        />
        <Meter
          label={`Spend this month (${usage.month})`}
          used={usd(usage.spendMonthUsd)}
          cap={capLabel(limits.monthlySpendUsd, usd(limits.monthlySpendUsd))}
          fill={meter(usage.spendMonthUsd, limits.monthlySpendUsd)}
        />
      </div>

      <dl className="ai-usage__breakdown">
        <div>
          <dt>Chat today</dt>
          <dd>
            {usage.chatCallsToday} replies · {usage.inputTokensToday.toLocaleString()} in ·{" "}
            {usage.outputTokensToday.toLocaleString()} out
          </dd>
        </div>
        <div>
          <dt>Dictation today</dt>
          <dd>
            {usage.voiceCallsToday} clips · {minutes(usage.voiceSecondsToday)} of audio
          </dd>
        </div>
        <div>
          <dt>Last hour</dt>
          <dd>
            {usage.callsLastHour} requests ({usage.callsLastMinute} in the last minute)
          </dd>
        </div>
      </dl>

      <p className="ai-usage__note">
        Estimated at OpenAI list prices: {pricing.chatModel} at{" "}
        {usd(pricing.chatInputUsdPerMtok)} per million input tokens and{" "}
        {usd(pricing.chatOutputUsdPerMtok)} per million output, {pricing.voiceModel} at{" "}
        {usd(pricing.voiceUsdPerMinute)} a minute. Your OpenAI dashboard remains the
        billing record.
      </p>
    </article>
  );
}
