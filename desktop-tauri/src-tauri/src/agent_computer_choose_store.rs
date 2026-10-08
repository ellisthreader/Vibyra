use crate::agent_computer_store::{self, Grant};
use crate::commands::run_blocking;
use crate::secret_store::SecretStore;
use crate::state::AppState;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

pub(super) async fn save(
    app: AppHandle,
    token: String,
    grant: Grant,
    id: String,
    key: String,
) -> Result<Value, String> {
    run_blocking(move || {
        let state = app.state::<AppState>();
        state.account.with_token_scope(&token, &grant.account_scope, || {
        let _guard = state.agent_computer_write.lock();
        let file = agent_computer_store::path(&state.settings_path)?;
        let mut grants = agent_computer_store::load(&file)?;
        SecretStore.write_agent_runner_key(&id, Some(&key))?;
        let old_keys: Vec<_> = grants.iter().filter(|old| {
            old.agent_id == grant.agent_id && old.account_scope == grant.account_scope
        }).map(|old| old.id.clone()).collect();
        grants.retain(|old| old.agent_id != grant.agent_id || old.account_scope != grant.account_scope);
        grants.push(grant.clone());
        if let Err(error) = agent_computer_store::save(&file, &grants) {
            let _ = SecretStore.write_agent_runner_key(&id, None);
            return Err(error);
        }
        for old in old_keys { let _ = SecretStore.write_agent_runner_key(&old, None); }
        Ok(json!({"id":grant.id,"agentId":grant.agent_id,"label":grant.label,
            "path":grant.source_path.as_ref().unwrap_or(&grant.path),
            "worktreePath":grant.source_path.as_ref().filter(|source| *source != &grant.path).map(|_| &grant.path),
            "canWrite":grant.can_write}))
        })?
    }).await
}
