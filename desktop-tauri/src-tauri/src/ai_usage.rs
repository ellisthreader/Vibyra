use serde::{Deserialize, Serialize};

// Pricing and the persisted ledger. The enforcement side lives in
// `ai_usage_guard`; this half is pure data so it can be unit-tested without a
// clock or a filesystem.

/// gpt-4o-mini list price, USD per million tokens.
pub const CHAT_INPUT_USD_PER_MTOK: f64 = 0.15;
pub const CHAT_OUTPUT_USD_PER_MTOK: f64 = 0.60;
/// whisper-1 list price, USD per minute of audio.
pub const VOICE_USD_PER_MINUTE: f64 = 0.006;

pub fn chat_cost_usd(input_tokens: u64, output_tokens: u64) -> f64 {
    (input_tokens as f64 * CHAT_INPUT_USD_PER_MTOK
        + output_tokens as f64 * CHAT_OUTPUT_USD_PER_MTOK)
        / 1_000_000.0
}

pub fn voice_cost_usd(seconds: f64) -> f64 {
    (seconds / 60.0) * VOICE_USD_PER_MINUTE
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AiCall {
    Chat,
    Voice,
}

/// The user's own spend ceiling, from settings. Zero means "no cap of this
/// kind" — deliberate, so someone who wants an uncapped desktop can have one
/// without us pretending a cap is in force.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiLimits {
    pub daily_calls: u32,
    pub hourly_calls: u32,
    pub daily_spend_usd: f64,
    pub monthly_spend_usd: f64,
}

pub fn capped(limit: f64) -> bool {
    limit > 0.0
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct UsageLedger {
    pub day: String,
    pub month: String,
    pub chat_calls: u32,
    pub voice_calls: u32,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub voice_seconds: f64,
    pub spend_usd: f64,
    pub month_calls: u32,
    pub month_spend_usd: f64,
}

impl UsageLedger {
    pub fn calls(&self) -> u32 {
        self.chat_calls + self.voice_calls
    }

    /// Zeroes whichever buckets belong to a period that has ended. Called
    /// before every read and every write, so a desktop left open across
    /// midnight still bills against the right day.
    pub fn roll_to(&mut self, day: &str, month: &str) {
        if self.day != day {
            self.day = day.to_owned();
            self.chat_calls = 0;
            self.voice_calls = 0;
            self.input_tokens = 0;
            self.output_tokens = 0;
            self.voice_seconds = 0.0;
            self.spend_usd = 0.0;
        }
        if self.month != month {
            self.month = month.to_owned();
            self.month_calls = 0;
            self.month_spend_usd = 0.0;
        }
    }

    /// Counted when the request is *admitted*, not when it succeeds. A call
    /// that errors out may still have been billed by OpenAI, and counting only
    /// successes would let an error loop run past the daily cap for free.
    pub fn count_call(&mut self, kind: AiCall) {
        match kind {
            AiCall::Chat => self.chat_calls += 1,
            AiCall::Voice => self.voice_calls += 1,
        }
        self.month_calls += 1;
    }

    pub fn add_chat_cost(&mut self, input_tokens: u64, output_tokens: u64) {
        self.input_tokens += input_tokens;
        self.output_tokens += output_tokens;
        self.add_spend(chat_cost_usd(input_tokens, output_tokens));
    }

    pub fn add_voice_cost(&mut self, seconds: f64) {
        self.voice_seconds += seconds;
        self.add_spend(voice_cost_usd(seconds));
    }

    fn add_spend(&mut self, usd: f64) {
        self.spend_usd += usd;
        self.month_spend_usd += usd;
    }
}

/// UTC period keys. UTC rather than local time keeps the ledger monotonic
/// across timezone changes and daylight saving, which a spend cap must be.
pub fn period_keys() -> (String, String) {
    let today = time::OffsetDateTime::now_utc().date();
    (
        format!(
            "{:04}-{:02}-{:02}",
            today.year(),
            today.month() as u8,
            today.day()
        ),
        format!("{:04}-{:02}", today.year(), today.month() as u8),
    )
}
