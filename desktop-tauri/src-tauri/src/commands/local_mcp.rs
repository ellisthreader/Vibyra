//! Settings commands for local MCP servers. The definitions (command, folder,
//! non-secret variables) live in `local-mcp.json` beside settings.json; secret
//! values only in the operating-system credential store. Nothing here returns a
//! secret value, and the backend is only ever told a name and the tool catalogue.

use crate::local_mcp_host::{dir, has_secret, supervisor, write_secret};
use serde::Serialize;
use std::collections::BTreeMap;
use tauri::AppHandle;
use vibyra_core::local_mcp::{store, ServerSpec, Status};

#[path = "local_mcp_connect.rs"]
mod connect;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerView {
    pub spec: ServerSpec,
    pub status: Status,
    /// An `npx`/`uvx` style launcher that fetches code at start without a pinned version.
    pub unpinned: bool,
    /// Which of `spec.secretEnv` have a value saved; never the values.
    pub secrets_saved: Vec<String>,
}

fn view(spec: ServerSpec) -> ServerView {
    ServerView {
        status: supervisor().status(&spec.id),
        unpinned: spec.unpinned_launcher(),
        secrets_saved: spec
            .secret_env
            .iter()
            .filter(|n| has_secret(&spec.id, n))
            .cloned()
            .collect(),
        spec,
    }
}

/// What the consent step needs to know before anything is saved.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Check {
    /// Why this definition cannot be saved, in words; `None` when it can.
    pub problem: Option<String>,
    pub unpinned: bool,
}

/// Validates a definition (a new one has no id yet) and flags unpinned launchers. Pure: starts nothing.
#[tauri::command]
pub async fn local_mcp_check(mut spec: ServerSpec) -> Check {
    if spec.id.is_empty() {
        spec.id = "preview-0000".into();
    }
    Check {
        problem: spec.validate().err().map(|e| e.to_string()),
        unpinned: spec.unpinned_launcher(),
    }
}

/// A native folder (or, for a file a server will create, a save) picker. `None` when cancelled.
#[tauri::command]
pub async fn local_mcp_pick(
    app: AppHandle,
    kind: String,
    title: String,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let title: String = title.chars().take(80).collect();
    super::run_blocking(move || {
        let builder = app.dialog().file().set_title(title);
        let picked = if kind == "folder" {
            builder.blocking_pick_folder()
        } else {
            builder.blocking_save_file()
        };
        picked
            .map(|path| {
                path.into_path()
                    .map(|p| p.to_string_lossy().into_owned())
                    .map_err(|e| e.to_string())
            })
            .transpose()
    })
    .await
}

fn folder(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    dir(app).ok_or_else(|| "No Vibyra settings directory".to_owned())
}

#[tauri::command]
pub async fn local_mcp_list(app: AppHandle) -> Result<Vec<ServerView>, String> {
    let dir = folder(&app)?;
    super::run_blocking(move || Ok(store::load(&dir).into_iter().map(view).collect())).await
}

/// Adds or edits one server. An empty `id` is a new server. `secrets` holds only the
/// values typed now: a missing or empty entry keeps what is already saved.
#[tauri::command]
pub async fn local_mcp_save(
    app: AppHandle,
    mut spec: ServerSpec,
    secrets: BTreeMap<String, String>,
) -> Result<ServerView, String> {
    let dir = folder(&app)?;
    super::run_blocking(move || {
        if spec.id.is_empty() {
            spec.id = uuid::Uuid::new_v4().to_string();
        }
        spec.validate().map_err(|e| e.to_string())?;
        let before = store::load(&dir).into_iter().find(|s| s.id == spec.id);
        // The backend's id for this server is never taken from the caller.
        spec.connection_id = before.as_ref().and_then(|b| b.connection_id.clone());
        for (name, value) in &secrets {
            if spec.secret_env.contains(name) && !value.is_empty() {
                write_secret(&spec.id, name, Some(value))?;
            }
        }
        for gone in before
            .iter()
            .flat_map(|b| &b.secret_env)
            .filter(|n| !spec.secret_env.contains(n))
        {
            write_secret(&spec.id, gone, None)?;
        }
        store::upsert(&dir, spec.clone()).map_err(|e| e.to_string())?;
        supervisor().stop(&spec.id); // launched differently now: the next use starts it fresh
        Ok(view(spec))
    })
    .await
}

#[tauri::command]
pub async fn local_mcp_set_enabled(
    app: AppHandle,
    id: String,
    enabled: bool,
) -> Result<ServerView, String> {
    let dir = folder(&app)?;
    super::run_blocking(move || {
        let mut spec = store::load(&dir)
            .into_iter()
            .find(|s| s.id == id)
            .ok_or("That server is not set up here.")?;
        spec.enabled = enabled;
        store::upsert(&dir, spec.clone()).map_err(|e| e.to_string())?;
        if !enabled {
            supervisor().stop(&id);
        }
        Ok(view(spec))
    })
    .await
}

/// Forget earlier failures so the server starts at the next use.
#[tauri::command]
pub async fn local_mcp_retry(app: AppHandle, id: String) -> Result<ServerView, String> {
    let dir = folder(&app)?;
    super::run_blocking(move || {
        let spec = store::load(&dir)
            .into_iter()
            .find(|s| s.id == id)
            .ok_or("That server is not set up here.")?;
        supervisor().retry(&id);
        Ok(view(spec))
    })
    .await
}

/// Starts the server if needed, lists its tools and registers them with the account.
#[tauri::command]
pub async fn local_mcp_connect(app: AppHandle, id: String) -> Result<serde_json::Value, String> {
    connect::register(&app, id).await
}

/// Removes the server from the account first (its grants end), then from this Mac:
/// its process, its secrets and its entry.
#[tauri::command]
pub async fn local_mcp_remove(app: AppHandle, id: String) -> Result<(), String> {
    let dir = folder(&app)?;
    let spec = store::load(&dir).into_iter().find(|s| s.id == id);
    if let Some(connection) = spec.as_ref().and_then(|s| s.connection_id.clone()) {
        connect::forget(&app, &connection).await?;
    }
    super::run_blocking(move || {
        supervisor().stop(&id);
        if let Some(spec) = spec {
            for name in &spec.secret_env {
                write_secret(&id, name, None)?;
            }
        }
        store::remove(&dir, &id)
            .map(|_| ())
            .map_err(|e| e.to_string())
    })
    .await
}
