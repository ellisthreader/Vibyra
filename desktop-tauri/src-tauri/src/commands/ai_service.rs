use serde::Serialize;
use tauri::State;

use crate::ai_usage::{
    AiLimits, CHAT_INPUT_USD_PER_MTOK, CHAT_OUTPUT_USD_PER_MTOK, VOICE_USD_PER_MINUTE,
};
use crate::state::AppState;

/// Everything the Vibyra AI settings pane renders, in one round trip.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiServiceView {
    key_configured: bool,
    /// Compatibility fields: clients never hold or reveal the provider key.
    key_from_environment: bool,
    key_hint: Option<String>,
    service_error: Option<String>,
    secure_storage_available: bool,
    recorder_available: bool,
    key_page_url: &'static str,
    limits: AiLimits,
    usage: UsageView,
    pricing: PricingView,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageView {
    day: String,
    month: String,
    calls_today: u32,
    chat_calls_today: u32,
    voice_calls_today: u32,
    input_tokens_today: u64,
    output_tokens_today: u64,
    voice_seconds_today: f64,
    spend_today_usd: f64,
    calls_this_month: u32,
    spend_month_usd: f64,
    calls_last_minute: u32,
    calls_last_hour: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PricingView {
    chat_model: &'static str,
    voice_model: &'static str,
    chat_input_usd_per_mtok: f64,
    chat_output_usd_per_mtok: f64,
    voice_usd_per_minute: f64,
}

#[tauri::command]
pub async fn ai_service_status(state: State<'_, AppState>) -> Result<AiServiceView, String> {
    let status = crate::assistant_api::status(&state).await;
    Ok(view(&state, status))
}

fn view(state: &AppState, status: crate::assistant_api::Status) -> AiServiceView {
    let ledger = state.usage.ledger();
    let (calls_last_minute, calls_last_hour) = state.usage.recent_counts();
    AiServiceView {
        key_configured: status.available,
        key_from_environment: false,
        key_hint: None,
        service_error: status.reason,
        secure_storage_available: state.account.snapshot().secure_storage,
        recorder_available: super::voice::recorder_available(),
        key_page_url: "",
        limits: state.ai_limits(),
        usage: UsageView {
            day: ledger.day.clone(),
            month: ledger.month.clone(),
            calls_today: ledger.calls(),
            chat_calls_today: ledger.chat_calls,
            voice_calls_today: ledger.voice_calls,
            input_tokens_today: ledger.input_tokens,
            output_tokens_today: ledger.output_tokens,
            voice_seconds_today: ledger.voice_seconds,
            spend_today_usd: ledger.spend_usd,
            calls_this_month: ledger.month_calls,
            spend_month_usd: ledger.month_spend_usd,
            calls_last_minute,
            calls_last_hour,
        },
        pricing: PricingView {
            chat_model: crate::commands::ai::CHAT_MODEL,
            voice_model: crate::commands::voice::VOICE_MODEL,
            chat_input_usd_per_mtok: CHAT_INPUT_USD_PER_MTOK,
            chat_output_usd_per_mtok: CHAT_OUTPUT_USD_PER_MTOK,
            voice_usd_per_minute: VOICE_USD_PER_MINUTE,
        },
    }
}
