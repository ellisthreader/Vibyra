// Always-on release watcher: one background task polls OpenRouter's model
// roster, and only when a genuinely new base model appears does anything
// else happen — an optional environment-owned Discord notification and a
// "models:released" event the frontend uses to refresh its catalog.
// Cost when nothing changed: one HTTP fetch + a set diff off the UI thread.

use std::collections::{BTreeMap, BTreeSet};
use std::path::PathBuf;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use vibyra_core::settings::Settings;

use crate::model_watch_discord::{configured_webhook, notify_models};

const MODELS_URL: &str = "https://openrouter.ai/api/v1/models?supported_parameters=tools";
const POLL_INTERVAL: Duration = Duration::from_secs(5 * 60);

#[derive(Debug, Clone, Serialize)]
pub struct ReleasedModel {
    pub id: String,
    pub name: String,
}

#[derive(Deserialize)]
struct ModelsPayload {
    data: Vec<RawModel>,
}

#[derive(Deserialize)]
pub(crate) struct RawModel {
    pub(crate) id: String,
    #[serde(default)]
    pub(crate) name: String,
}

#[derive(Default, Serialize, Deserialize)]
pub(crate) struct WatchStore {
    pub(crate) known: BTreeSet<String>,
    #[serde(default)]
    pub(crate) pending: BTreeMap<String, String>,
}

/// ":batch"/":free" variants never count as separate releases.
fn base_id(id: &str) -> &str {
    id.split(':').next().unwrap_or(id)
}

pub(crate) fn diff_new(known: &BTreeSet<String>, current: &[RawModel]) -> Vec<ReleasedModel> {
    let mut fresh = Vec::new();
    let mut reported = BTreeSet::new();
    for model in current {
        let base = base_id(&model.id);
        if !known.contains(base) && reported.insert(base.to_string()) {
            fresh.push(ReleasedModel {
                id: base.to_string(),
                name: if model.name.is_empty() {
                    base.to_string()
                } else {
                    model.name.clone()
                },
            });
        }
    }
    fresh
}

fn store_path() -> PathBuf {
    Settings::default_path()
        .parent()
        .map(|dir| dir.join("model-watch.json"))
        .unwrap_or_else(|| std::env::temp_dir().join("vibyra-model-watch.json"))
}

fn load_store(path: &PathBuf) -> Result<Option<WatchStore>, String> {
    let raw = match std::fs::read_to_string(path) {
        Ok(raw) => raw,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err("could not read the model watcher state".into()),
    };
    serde_json::from_str(&raw)
        .map(Some)
        .map_err(|_| "model watcher state is invalid; refusing to reseed it".into())
}

fn save_store(path: &PathBuf, store: &WatchStore) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)
            .map_err(|_| "could not create the model watcher state directory".to_string())?;
    }
    let json = serde_json::to_string(store)
        .map_err(|_| "could not encode the model watcher state".to_string())?;
    std::fs::write(path, json).map_err(|_| "could not save the model watcher state".to_string())
}

pub(crate) fn apply_fresh(store: &mut WatchStore, fresh: &[ReleasedModel]) {
    for model in fresh {
        store.known.insert(model.id.clone());
        store.pending.insert(model.id.clone(), model.name.clone());
    }
}

pub(crate) fn pending_models(store: &WatchStore) -> Vec<ReleasedModel> {
    store
        .pending
        .iter()
        .map(|(id, name)| ReleasedModel {
            id: id.clone(),
            name: name.clone(),
        })
        .collect()
}

async fn deliver_pending(store: &mut WatchStore, path: &PathBuf) -> Result<(), String> {
    let pending = pending_models(store);
    if pending.is_empty() {
        return Ok(());
    }
    let Some(webhook) = configured_webhook()? else {
        return Ok(());
    };
    notify_models(&webhook, &pending).await?;
    store.pending.clear();
    save_store(path, store)
}

async fn tick(app: &AppHandle, store: &PathBuf) -> Result<(), String> {
    let mut stored = load_store(store)?;
    let mut delivery_failed = false;
    if let Some(state) = stored.as_mut() {
        if let Err(error) = deliver_pending(state, store).await {
            delivery_failed = true;
            eprintln!("model watch: pending Discord delivery retained: {error}");
        }
    }

    let payload: ModelsPayload = reqwest::Client::new()
        .get(MODELS_URL)
        .header("Accept", "application/json")
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| format!("fetch failed: {e}"))?
        .json()
        .await
        .map_err(|e| format!("bad payload: {e}"))?;

    let Some(mut state) = stored else {
        // First run: seed the roster silently so 300 models aren't "news".
        let known = payload
            .data
            .iter()
            .map(|m| base_id(&m.id).to_string())
            .collect();
        return save_store(
            store,
            &WatchStore {
                known,
                pending: BTreeMap::new(),
            },
        );
    };

    let fresh = diff_new(&state.known, &payload.data);
    if fresh.is_empty() {
        return Ok(());
    }

    apply_fresh(&mut state, &fresh);
    save_store(store, &state)?;
    let _ = app.emit("models:released", &fresh);
    if !delivery_failed {
        if let Err(error) = deliver_pending(&mut state, store).await {
            eprintln!("model watch: Discord delivery queued for retry: {error}");
        }
    }
    Ok(())
}

pub fn spawn(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let store = store_path();
        loop {
            if let Err(err) = tick(&app, &store).await {
                eprintln!("model watch: {err}");
            }
            tokio::time::sleep(POLL_INTERVAL).await;
        }
    });
}
