// The AI service contract: what a call costs, what has been spent, and what
// the backend is configured with. Split out of `types.ts`, which re-exports
// every name here, so both files stay under the desktop line ceiling.

export interface AiLimits {
  dailyCalls: number;
  hourlyCalls: number;
  dailySpendUsd: number;
  monthlySpendUsd: number;
}

export interface AiUsage {
  day: string;
  month: string;
  callsToday: number;
  chatCallsToday: number;
  voiceCallsToday: number;
  speechCallsToday: number;
  inputTokensToday: number;
  outputTokensToday: number;
  voiceSecondsToday: number;
  speechCharsToday: number;
  spendTodayUsd: number;
  callsThisMonth: number;
  spendMonthUsd: number;
  callsLastMinute: number;
  callsLastHour: number;
}

export interface AiPricing {
  chatModel: string;
  voiceModel: string;
  speechModel: string;
  chatInputUsdPerMtok: number;
  chatOutputUsdPerMtok: number;
  voiceUsdPerMinute: number;
  speechUsdPerMchar: number;
}

export interface AiServiceStatus {
  keyConfigured: boolean;
  /** Masked fragment such as "sk-…wxyz" — never the whole key. */
  keyHint: string | null;
  secureStorageAvailable: boolean;
  recorderAvailable: boolean;
  keyPageUrl: string;
  limits: AiLimits;
  usage: AiUsage;
  pricing: AiPricing;
}
