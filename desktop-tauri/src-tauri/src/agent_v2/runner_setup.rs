//! What a runner tick needs before it can claim: the local account to run
//! as, and a current runtime binding (registered or rotated).

use crate::agent_v2::claude_cmd::find_program;
use crate::agent_v2::registration::{self, Registered};
use crate::agent_v2::run::Account;
use crate::agent_v2::selection::Selection;
use crate::agent_v2::signin_watch::Parked;
use crate::agent_v2::status::{self, simple};
use crate::provider_auth_registry::Registry;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub(super) fn account(selection: &Selection) -> Result<Account, String> {
    let program = find_program(&selection.provider).ok_or("Claude Code is not installed.")?;
    let home = Registry::load().home(&selection.provider, &selection.account)?;
    let config_dir = home.env().map(|(_, dir)| PathBuf::from(dir));
    let mut memory_roots = vec![home.credentials_dir()];
    if let Some(user_home) = dirs::home_dir().map(|h| h.join(".claude")) {
        if config_dir.is_none() && !memory_roots.contains(&user_home) {
            memory_roots.push(user_home);
        }
    }
    Ok(Account {
        program,
        config_dir,
        memory_roots,
    })
}

pub(super) async fn ensure_registered(
    app: &AppHandle,
    dir: &std::path::Path,
    base: &str,
    token: &str,
    scope: &str,
    selection: &Selection,
    version: &str,
) -> Result<(Registered, String), String> {
    let identity_dir = dir.join("phone");
    let host = tauri::async_runtime::spawn_blocking(move || {
        vibyra_host::host_identity_id_with_key_store(
            &identity_dir,
            &crate::secret_store::SecretStore,
        )
    })
    .await
    .map_err(|e| e.to_string())??;
    let existing_dir = dir.to_path_buf();
    let existing = tauri::async_runtime::spawn_blocking(move || registration::load(&existing_dir))
        .await
        .ok()
        .flatten();
    if let Some((record, key)) = existing.filter(|(r, _)| {
        r.matches(scope, &host, selection, version)
            && r.capabilities == registration::capabilities(selection)
    }) {
        return Ok((record, key));
    }
    status::set(app, simple("registering", None));
    let body = registration::payload(&host, selection, version);
    let (runtime_id, key) = registration::register(base, token, body)
        .await
        .map_err(|error| error.to_string())?;
    let record = Registered {
        runtime_id,
        host_id: host,
        account_scope: scope.to_owned(),
        selection: selection.clone(),
        provider_version: version.to_owned(),
        capabilities: registration::capabilities(selection),
    };
    let (saved_dir, saved, saved_key) = (dir.to_path_buf(), record.clone(), key.clone());
    let (saved_app, saved_token) = (app.clone(), token.to_owned());
    tauri::async_runtime::spawn_blocking(move || {
        saved_app
            .state::<crate::state::AppState>()
            .account
            .with_token_scope(&saved_token, &saved.account_scope, || {
                registration::store(&saved_dir, &saved, &saved_key)
            })?
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok((record, key))
}

/// While a run is parked on `provider_signin`, probe the selected account;
/// when it is signed in again, forget the binding so this tick re-registers
/// (rotating the runner key), which is what un-parks the run on the backend.
pub(super) async fn recheck_signin(
    parked: &mut Parked,
    local: &Result<Account, String>,
    selection: &Selection,
    dir: &std::path::Path,
) {
    let now = std::time::Instant::now();
    let (Some(current), Ok(_)) = (parked.watch.as_mut(), local) else {
        return;
    };
    if !current.due(now) {
        return;
    }
    let (provider, id) = (selection.provider.clone(), selection.account.clone());
    let signed_in = tauri::async_runtime::spawn_blocking(move || {
        let Some(definition) = crate::provider_auth_state::definition(&provider) else {
            return false;
        };
        Registry::load()
            .home(&provider, &id)
            .is_ok_and(|home| crate::provider_auth_probe::probe(definition, &home).connected)
    })
    .await
    .unwrap_or(false);
    if current.observe(signed_in, now) {
        parked.retries = current.next_retries();
        parked.watch = None;
        registration::clear(dir);
    }
}

type BoundClaim = (
    std::sync::Arc<crate::agent_v2::execute::Control>,
    crate::agent_v2::session_bound::Bound,
);

/// Capture account authority after the asynchronous claim and before starting tools.
pub(super) async fn bind_claim(
    account: &crate::account_session::AccountSessionManager,
    token: &str,
    scope: &str,
    api: &super::RunnerApi,
    claimed: &serde_json::Value,
) -> Result<BoundClaim, String> {
    let control = std::sync::Arc::new(crate::agent_v2::execute::Control::default());
    match crate::agent_v2::session_bound::bind(account, token, scope, &control) {
        Ok(bound) => Ok((control, bound)),
        Err(error) => {
            if let (Some(id), Some(generation)) =
                (claimed["id"].as_str(), claimed["generation"].as_u64())
            {
                let _ = api
                    .fail(id, generation, "runner_error", "Your account changed.")
                    .await;
            }
            Err(error)
        }
    }
}
