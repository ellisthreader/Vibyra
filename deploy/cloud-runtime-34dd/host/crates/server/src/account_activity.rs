//! Tells the account API how busy this computer is so the machine stays up
//! while work runs, and which providers are signed in. Counts and booleans
//! only: no output, no prompts, no credential contents.
use crate::{account_http::post_json, account_source::read_token, config::Account};
use serde_json::{json, Value};
use std::{
    path::{Path, PathBuf},
    time::Duration,
};
use vibyra_engine::{Activity, Engine};

/// A provider counts as signed in when its credential file exists and is not
/// empty. Only metadata is read, never the file.
pub(crate) fn login(home: &Path) -> Value {
    let present = |relative: &str| {
        std::fs::metadata(home.join(relative)).is_ok_and(|m| m.is_file() && m.len() > 0)
    };
    json!({"claude":present(".claude/.credentials.json"),"codex":present(".codex/auth.json")})
}

/// `owner/name` from a GitHub remote URL, whatever its scheme.
pub(crate) fn repo_slug(remote: &str) -> Option<String> {
    let rest = remote
        .trim()
        .trim_end_matches('/')
        .trim_end_matches(".git")
        .split_once("github.com")?
        .1
        .trim_start_matches([':', '/']);
    let mut parts = rest.split('/');
    let (owner, name) = (parts.next()?, parts.next()?);
    (parts.next().is_none() && !owner.is_empty() && !name.is_empty())
        .then(|| format!("{owner}/{name}"))
}

fn project(name: &str, path: &Path) -> Value {
    let git = path.join(".git");
    let branch = std::fs::read_to_string(git.join("HEAD"))
        .ok()
        .and_then(|head| {
            head.trim()
                .strip_prefix("ref: refs/heads/")
                .map(str::to_owned)
        });
    let repo = std::fs::read_to_string(git.join("config"))
        .ok()
        .and_then(|config| {
            let mut in_origin = false;
            for line in config.lines().map(str::trim) {
                if line.starts_with('[') {
                    in_origin = line.replace(' ', "") == "[remote\"origin\"]";
                } else if in_origin {
                    if let Some(url) = line.strip_prefix("url") {
                        return repo_slug(url.trim_start().trim_start_matches('='));
                    }
                }
            }
            None
        });
    json!({"name":name,"repo":repo,"branch":branch})
}

pub(crate) fn payload(activity: &Activity, home: &Path) -> Value {
    json!({"running":activity.running,"open":activity.open,"waitingApproval":activity.waiting_approval,
        "providerPolicyVersion":1,
        "login":login(home),
        "projects":activity.projects.iter().take(vibyra_engine::MAX_PROJECTS).map(|(n, p)| project(n, p)).collect::<Vec<_>>()})
}

fn home() -> PathBuf {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_default()
}

pub(crate) async fn report(account: &Account, engine: &Engine) -> Result<(), String> {
    let bearer = read_token(&account.token_file)?;
    let body = payload(
        &engine.activity(Duration::from_secs(account.idle_session_secs)),
        &home(),
    );
    let (status, reply) = post_json(
        &account.api_base,
        &format!("/api/cloud-runtime/{}/host/activity", account.workspace_id),
        &bearer,
        &body,
    )
    .await?;
    if (200..300).contains(&status) {
        apply_policy(engine, &reply)
    } else {
        Err(format!("activity report refused ({status})"))
    }
}

/// Account mode starts closed and gets a complete policy before opening any listener or relay.
pub(crate) async fn initialize(account: &Account, engine: &Engine) -> Result<(), String> {
    engine.set_disabled_providers(&["claude".into(), "codex".into()]);
    report(account, engine).await
}

/// Malformed/missing policy never clears an existing restriction. Deploy the matching backend first.
pub(crate) fn apply_policy(engine: &Engine, reply: &Value) -> Result<(), String> {
    let fail = || "Cloud account permissions are unavailable. Try again shortly.".to_owned();
    if reply["ok"] != true {
        return Err(fail());
    }
    let list = reply["disabledProviders"].as_array().ok_or_else(fail)?;
    let names: Option<Vec<String>> = list.iter().map(|p| p.as_str().map(str::to_owned)).collect();
    engine.set_disabled_providers(&names.ok_or_else(fail)?);
    Ok(())
}

/// Runs for the life of the process. A failed report is logged and retried on
/// the next tick; it never stops the Host.
pub(crate) async fn run(account: Account, engine: std::sync::Arc<Engine>) {
    let mut ticker = tokio::time::interval(Duration::from_secs(account.interval));
    ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    let mut failing = false;
    loop {
        ticker.tick().await;
        match report(&account, &engine).await {
            Ok(()) => failing = false,
            Err(error) if !failing => {
                failing = true;
                eprintln!("Vibyra Host: {error}");
            }
            Err(_) => {}
        }
    }
}

/// Picks up folders created under the projects directory while running.
pub(crate) async fn watch_projects(root: PathBuf, engine: std::sync::Arc<Engine>) {
    loop {
        if let Err(error) = engine.adopt_projects_in(&root) {
            eprintln!("Vibyra Host: {error}");
        }
        tokio::time::sleep(Duration::from_secs(3)).await;
    }
}
