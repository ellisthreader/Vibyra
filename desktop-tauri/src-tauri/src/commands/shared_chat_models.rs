//! Provider model discovery may spawn a runtime and retains phone authorization.
use crate::state::AppState;
use serde_json::Value;
use tauri::State;

#[tauri::command]
pub async fn shared_chat_account_models(
    state: State<'_, AppState>,
    provider: String,
    account_id: String,
    phone_request_id: Option<String>,
) -> Result<Value, String> {
    let effect = super::phone_effects::PhoneEffect::capture(
        &state,
        phone_request_id.as_deref(),
        &["models", "create"],
        None,
        None,
    )?;
    let accounts = state.provider_auth.clone();
    super::run_blocking(move || {
        super::phone_effects::scoped(effect, |effect| {
            if !accounts.signed_in(&provider, &account_id)? {
                return Err("Connect this AI account first".into());
            }
            let home =
                crate::provider_auth_registry::Registry::load().home(&provider, &account_id)?;
            let environment = if provider == "codex" {
                vec![(
                    "CODEX_HOME".into(),
                    home.credentials_dir().to_string_lossy().into_owned(),
                )]
            } else {
                home.env().into_iter().collect()
            };
            super::phone_effects::check(effect)?;
            vibyra_engine::Engine::account_models(provider, environment)
        })
    })
    .await
}
