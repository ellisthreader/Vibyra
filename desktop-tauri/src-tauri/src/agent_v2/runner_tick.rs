use super::super::api::RunnerApi;
use super::super::registration;
use super::super::selection;
use super::super::status::{self, simple, RunnerStatus};
use super::setup::{account, ensure_registered, recheck_signin};
use super::{settings_dir, Cache};
use crate::agent_computer_access::account_scope;
use crate::state::AppState;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

const IDLE: Duration = Duration::from_secs(3);
const RECHECK: Duration = Duration::from_secs(5 * 60);

pub(super) async fn tick(app: &AppHandle, cache: &mut Cache) -> Duration {
    for outcome in cache.pool.reap().await {
        cache.signin.after(
            matches!(outcome, super::super::execute::Outcome::Failed(c) if c=="provider_signin"),
        );
    }
    let state = app.state::<AppState>();
    let (Some(token), Ok(scope)) = (state.account.token(), account_scope(&state)) else {
        cache.pool.stop().await;
        status::set(app, simple("signed_out", None));
        return Duration::from_secs(15);
    };
    let Some(dir) = settings_dir(app) else {
        return Duration::from_secs(60);
    };
    let Some(selection) = selection::load(&dir) else {
        cache.pool.stop().await;
        status::set(
            app,
            simple("no_selection", Some("Choose the AI account Agents use.")),
        );
        return Duration::from_secs(15);
    };
    let identity = format!("{}:{}:{:?}", scope, token, selection);
    if cache.identity.as_ref() != Some(&identity) {
        cache.pool.stop().await;
        cache.identity = Some(identity);
        cache.signin = Default::default();
    }
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
        cache.pool.stop().await;
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
            cache.pool.stop().await;
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
    cache
        .pool
        .bind(format!("{}:{}", api.runtime_id, api.key))
        .await;
    for slot in cache.pool.available() {
        match api.claim_slot(slot).await {
            Ok(Some(claimed)) => {
                let id = claimed["id"].as_str().unwrap_or_default().to_owned();
                let (control, bound) =
                    match super::setup::bind_claim(&state.account, &token, &scope, &api, &claimed)
                        .await
                    {
                        Ok(value) => value,
                        Err(_) => return IDLE,
                    };
                let task = super::job::execute(
                    app.clone(),
                    api.clone(),
                    claimed,
                    selection.clone(),
                    account.clone(),
                    control.clone(),
                    bound,
                );
                cache.pool.start(slot, id, control, task);
            }
            Ok(None) => break,
            Err(error) if error.needs_registration() => {
                cache.pool.stop().await;
                registration::clear(&dir);
                return Duration::from_secs(5);
            }
            Err(error) if error.disabled() => {
                cache.pool.stop().await;
                cache.enabled = None;
                status::set(app, simple("disabled", None));
                return Duration::from_secs(60);
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
                return Duration::from_secs(10);
            }
        }
    }
    let active = cache.pool.active();
    status::set(
        app,
        described(
            if active.is_empty() { "idle" } else { "running" },
            Some(&api.runtime_id),
            active.first().map(String::as_str),
            (!active.is_empty()).then(|| format!("{} tasks running", active.len())),
        ),
    );
    IDLE
}
