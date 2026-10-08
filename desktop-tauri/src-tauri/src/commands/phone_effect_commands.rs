//! Renderer checks supplement mandatory native mutation fences.
use super::phone_effects::{check, PhoneEffect};
use crate::state::AppState;

#[tauri::command]
pub fn phone_terminal_authorize(
    state: tauri::State<'_, AppState>,
    id: String,
    pane: i64,
) -> Result<(), String> {
    let effect = PhoneEffect::capture(&state, Some(&id), &["close"], None, Some(pane))?;
    check(&effect)
}

#[tauri::command]
pub fn phone_preference_authorize(
    state: tauri::State<'_, AppState>,
    id: String,
    provider: String,
    account: String,
) -> Result<(), String> {
    let effect = PhoneEffect::capture(&state, Some(&id), &["accountDefault"], None, None)?
        .ok_or("Missing phone authorization")?;
    if effect.request()["provider"].as_str() != Some(provider.as_str())
        || effect.request()["account"].as_str() != Some(account.as_str())
    {
        return Err("This phone request names another AI account".into());
    }
    effect.check()
}

#[tauri::command]
pub fn phone_request_authorize(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let effect = PhoneEffect::capture(
        &state,
        Some(&id),
        &[
            "models",
            "create",
            "resumeSaved",
            "close",
            "adopt",
            "rename",
            "forget",
            "accountDefaults",
            "optionalAgents",
            "optionalAgent",
            "accountDefault",
        ],
        None,
        None,
    )?;
    check(&effect)
}
