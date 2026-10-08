//! The background loop: signed in → account selected → Agent V2 enabled for
//! this user → binding registered → claim (every 3 s idle) → run one task.

use super::api::RunnerApi;
use super::registration;
use super::run::run;
use super::selection;
use super::status::{self, simple, RunnerStatus};
use crate::agent_computer_access::account_scope;
use crate::state::AppState;
use std::path::PathBuf;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

#[path = "runner_setup.rs"]
mod setup;
use setup::{account, ensure_registered, recheck_signin};

const IDLE: Duration = Duration::from_secs(3);
const RECHECK: Duration = Duration::from_secs(5 * 60);

#[derive(Default)]
struct Cache {
    /// `(token, enabled, checked at)`: the flag check is cheap but not free.
    enabled: Option<(String, bool, Instant)>,
    /// Parked on `provider_signin`: re-register once the account signs back in.
    signin: super::signin_watch::Parked,
}

pub fn spawn(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        // Run folders live in a private app folder; a crash can leave one (with its
        // broker credentials) behind, here or in the temp directory of older builds.
        if let Some(dir) = settings_dir(&app) {
            super::workspace::use_private_base(dir.join("agent-runs"));
        }
        let _ = tauri::async_runtime::spawn_blocking(super::workspace_sweep::sweep_stale).await;
        let mut cache = Cache::default();
        loop {
            let wait = tick(&app, &mut cache).await;
            tokio::time::sleep(wait).await;
        }
    });
}

fn settings_dir(app: &AppHandle) -> Option<PathBuf> {
    app.state::<AppState>()
        .settings_path
        .parent()
        .map(PathBuf::from)
}

async fn tick(app: &AppHandle, cache: &mut Cache) -> Duration {
    let state = app.state::<AppState>();
    let (Some(token), Ok(scope)) = (state.account.token(), account_scope(&state)) else {
        status::set(app, simple("signed_out", None));
        return Duration::from_secs(15);
    };
    let Some(dir) = settings_dir(app) else {
        return Duration::from_secs(60);
    };
    let Some(selection) = selection::load(&dir) else {
        status::set(
            app,
            simple("no_selection", Some("Choose the AI account Agents use.")),
        );
        return Duration::from_secs(15);
    };
    let base = crate::account_api::base_url();
    let fresh = cache
        .enabled
        .as_ref()
        .filter(|(for_token, _, at)| *for_token == token && at.elapsed() < RECHECK);
    let enabled = match fresh {
        Some((_, enabled, _)) => *enabled,
        None => match registration::enabled(&base, &token).await {
            Ok(enabled) => {
                cache.enabled = Some((token.clone(), enabled, Instant::now()));
                enabled
            }
            Err(error) => {
                status::set(app, simple("error", Some(&error.to_string())));
                return Duration::from_secs(30);
            }
        },
    };
    if !enabled {
        status::set(app, simple("disabled", None));
        return Duration::from_secs(60);
    }
    let described = |state: &str,
                     runtime: Option<&str>,
                     run: Option<&str>,
                     detail: Option<String>| RunnerStatus {
        state: state.into(),
        provider: Some(selection.provider.clone()),
        account: Some(selection.account.clone()),
        runtime_id: runtime.map(str::to_owned),
        run_id: run.map(str::to_owned),
        detail,
    };
    let local = if selection.controlled_tools() {
        account(&selection)
    } else {
        Err(String::new())
    };
    let version = match &local {
        Ok(account) => {
            let program = account.program.clone();
            tauri::async_runtime::spawn_blocking(move || registration::provider_version(&program))
                .await
                .unwrap_or_default()
        }
        Err(_) => String::new(),
    };
    recheck_signin(&mut cache.signin, &local, &selection, &dir).await;
    let (registered, key) =
        match ensure_registered(app, &dir, &base, &token, &scope, &selection, &version).await {
            Ok(pair) => pair,
            Err(detail) => {
                status::set(app, described("error", None, None, Some(detail)));
                return Duration::from_secs(30);
            }
        };
    let account = match local {
        Ok(account) => account,
        Err(detail) => {
            let detail = Some(if detail.is_empty() {
                "Agent tasks need a Claude Code account for now.".into()
            } else {
                detail
            });
            status::set(
                app,
                described("not_ready", Some(&registered.runtime_id), None, detail),
            );
            return Duration::from_secs(60);
        }
    };
    let api = RunnerApi {
        base,
        runtime_id: registered.runtime_id.clone(),
        key,
    };
    match api.claim().await {
        Ok(None) => {
            status::set(app, described("idle", Some(&api.runtime_id), None, None));
            IDLE
        }
        Ok(Some(claimed)) => {
            let run_id = claimed["id"].as_str().map(str::to_owned);
            status::set(
                app,
                described("running", Some(&api.runtime_id), run_id.as_deref(), None),
            );
            let (control, _bound) =
                match setup::bind_claim(&state.account, &token, &scope, &api, &claimed).await {
                    Ok(bound) => bound,
                    Err(_) => return IDLE,
                };
            // Phase 4: approved computer actions run beside the provider on this lease.
            let computer = crate::agent_v2_computer::spawn(app.clone(), api.clone(), &claimed);
            let browser = crate::agent_v2_browser::spawn(app.clone(), api.clone(), &claimed);
            let local_mcp = crate::agent_v2_local_mcp::spawn(app.clone(), api.clone(), &claimed);
            let outcome = run(api.clone(), claimed, selection.clone(), account, control).await;
            computer.abort();
            browser.abort();
            local_mcp.abort();
            cache.signin.after(
                matches!(&outcome, super::execute::Outcome::Failed(c) if c == "provider_signin"),
            );
            // A provider_signin/limits outcome is parked by the backend (per run)
            // until the account is selected again or its reset time passes.
            let detail = Some(format!("{outcome:?}"));
            status::set(app, described("idle", Some(&api.runtime_id), None, detail));
            Duration::from_millis(500)
        }
        Err(error) if error.needs_registration() => {
            registration::clear(&dir);
            Duration::from_secs(5)
        }
        Err(error) if error.disabled() => {
            cache.enabled = None;
            status::set(app, simple("disabled", None));
            Duration::from_secs(60)
        }
        Err(error) => {
            status::set(
                app,
                described(
                    "error",
                    Some(&api.runtime_id),
                    None,
                    Some(error.to_string()),
                ),
            );
            Duration::from_secs(10)
        }
    }
}
