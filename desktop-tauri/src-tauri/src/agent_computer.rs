use crate::account_api;
use crate::agent_computer_access::{account_scope, looks_uuid, revoke_cloud};
use crate::agent_computer_store::{self, Grant};
use crate::commands::run_blocking;
use crate::secret_store::SecretStore;
use crate::state::AppState;
use serde_json::{json, Value};
use std::time::Duration;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub async fn agent_computer_grants(state: State<'_, AppState>) -> Result<Vec<Value>, String> {
    let scope = account_scope(&state)?;
    let file = agent_computer_store::path(&state.settings_path)?;
    let grants = run_blocking(move || agent_computer_store::load(&file)).await?;
    Ok(grants
        .into_iter()
        .filter(|g| g.account_scope == scope)
        .map(|g| {
            json!({"id":g.id,"agentId":g.agent_id,"hostId":g.host_id,
            "label":g.label,"path":g.source_path.as_ref().unwrap_or(&g.path),
            "worktreePath":g.source_path.as_ref().filter(|source| *source != &g.path).map(|_| &g.path),
            "canWrite":g.can_write,"needsReselection":g.can_write && g.source_path.is_none(),
            "revoked":g.revoked})
        })
        .collect())
}

#[tauri::command]
pub async fn agent_computer_choose(
    app: AppHandle,
    agent_id: String,
    allow_edits: bool,
) -> Result<Value, String> {
    if !looks_uuid(&agent_id) {
        return Err("Choose a valid teammate.".into());
    }
    let state = app.state::<AppState>();
    let token = state
        .account
        .token()
        .ok_or("Sign in to give a teammate computer access.")?;
    let scope = account_scope(&state)?;
    let picker = app.clone();
    let selected = run_blocking(move || {
        Ok(picker
            .dialog()
            .file()
            .set_title(if allow_edits {
                "Allow this teammate to propose edits in a project folder"
            } else {
                "Allow this teammate to read a project folder"
            })
            .blocking_pick_folder()
            .and_then(|file| file.into_path().ok()))
    })
    .await?;
    let Some(selected) = selected else {
        return Ok(json!({"cancelled":true}));
    };
    let (path, git_edit) = run_blocking(move || {
        let path = selected.canonicalize().map_err(|e| e.to_string())?;
        if !path.is_dir() {
            return Err("Choose a project folder.".into());
        }
        let git_edit = if allow_edits {
            vibyra_core::workspace_agent::classify_edit_source(&path)
                .map_err(|error| error.to_string())?
        } else {
            false
        };
        Ok((path, git_edit))
    })
    .await?;
    let label = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Project")
        .chars()
        .take(80)
        .collect::<String>();
    let identity_dir = state
        .settings_path
        .parent()
        .ok_or("No Vibyra settings directory")?
        .join("phone");
    let host_id = run_blocking(move || vibyra_host::host_identity_id(&identity_dir)).await?;
    let response = crate::http_client::shared()
        .post(format!(
            "{}/api/agents/v1/workspaces",
            account_api::base_url()
        ))
        .bearer_auth(&token)
        .json(&json!({"agentId":agent_id,"hostId":host_id,"label":label,"canWrite":allow_edits}))
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .map_err(|_| {
            "Connection interrupted. Check this teammate's computer access before retrying."
                .to_string()
        })?;
    let status = response.status().as_u16();
    let value: Value = response
        .json()
        .await
        .map_err(|_| "The service returned an unreadable response.".to_string())?;
    if !(200..300).contains(&status) {
        return Err(account_api::error_detail(&value, status));
    }
    if state.account.token().as_deref() != Some(&token) || account_scope(&state)? != scope {
        return Err("Your account changed. Check the computer grant before retrying.".into());
    }
    let data = &value["workspace"];
    if data["canWrite"].as_bool() != Some(allow_edits) {
        return Err("The service returned a different computer access level.".into());
    }
    let id = data["id"]
        .as_str()
        .filter(|id| looks_uuid(id))
        .ok_or("Missing workspace identity")?
        .to_owned();
    let key = data["runnerKey"]
        .as_str()
        .filter(|key| key.len() == 64)
        .ok_or("Missing runner key")?
        .to_owned();
    let source_path = allow_edits.then(|| path.clone());
    let worktree = if git_edit {
        let source = path.clone();
        let storage = state
            .settings_path
            .parent()
            .ok_or("No Vibyra settings directory")?
            .join("agent-computer-worktrees");
        let worktree_id = id.clone();
        match run_blocking(move || {
            vibyra_core::workspace_agent::prepare(&source, &storage, &worktree_id)
                .map_err(|error| error.to_string())
        })
        .await
        {
            Ok(worktree) => Some(worktree),
            Err(error) => {
                let _ = revoke_cloud(&token, &value["workspace"]["id"]).await;
                return Err(error);
            }
        }
    } else {
        None
    };
    let grant = Grant {
        id: id.clone(),
        agent_id,
        host_id,
        account_scope: scope,
        label,
        path: worktree.unwrap_or(path),
        source_path,
        can_write: allow_edits,
        revoked: false,
    };
    let saved_app = app.clone();
    let stored = run_blocking(move || {
        let state = saved_app.state::<AppState>();
        let _guard = state.agent_computer_write.lock();
        let file = agent_computer_store::path(&state.settings_path)?;
        let mut grants = agent_computer_store::load(&file)?;
        SecretStore.write_agent_runner_key(&id, Some(&key))?;
        let old_keys: Vec<_> = grants
            .iter()
            .filter(|old| {
                old.agent_id == grant.agent_id && old.account_scope == grant.account_scope
            })
            .map(|old| old.id.clone())
            .collect();
        grants.retain(|old| {
            old.agent_id != grant.agent_id || old.account_scope != grant.account_scope
        });
        grants.push(grant.clone());
        if let Err(error) = agent_computer_store::save(&file, &grants) {
            let _ = SecretStore.write_agent_runner_key(&id, None);
            return Err(error);
        }
        for old in old_keys {
            let _ = SecretStore.write_agent_runner_key(&old, None);
        }
        Ok(json!({"id":grant.id,"agentId":grant.agent_id,"label":grant.label,
            "path":grant.source_path.as_ref().unwrap_or(&grant.path),
            "worktreePath":grant.source_path.as_ref().filter(|source| *source != &grant.path).map(|_| &grant.path),
            "canWrite":grant.can_write}))
    })
    .await;
    if stored.is_err() {
        let _ = revoke_cloud(&token, &value["workspace"]["id"]).await;
    }
    stored
}
