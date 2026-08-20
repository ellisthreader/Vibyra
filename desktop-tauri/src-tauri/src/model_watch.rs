// Always-on release watcher: one background task polls OpenRouter's model
// roster, and only when a genuinely new base model appears does anything
// else happen — an optional environment-owned Discord notification and a
// "models:released" event the frontend uses to refresh its catalog.
// Cost when nothing changed: one HTTP fetch + a set diff off the UI thread.

use std::collections::BTreeSet;
use std::path::PathBuf;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use vibyra_core::settings::Settings;

const MODELS_URL: &str = "https://openrouter.ai/api/v1/models?supported_parameters=tools";
const POLL_INTERVAL: Duration = Duration::from_secs(5 * 60);
const DISCORD_MAX_LISTED: usize = 10;

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
struct WatchStore {
    known: BTreeSet<String>,
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

fn load_known(path: &PathBuf) -> Option<BTreeSet<String>> {
    let raw = std::fs::read_to_string(path).ok()?;
    serde_json::from_str::<WatchStore>(&raw)
        .ok()
        .map(|s| s.known)
}

fn save_known(path: &PathBuf, known: &BTreeSet<String>) {
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if let Ok(json) = serde_json::to_string(&WatchStore {
        known: known.clone(),
    }) {
        let _ = std::fs::write(path, json);
    }
}

async fn notify_discord(webhook: &str, fresh: &[ReleasedModel]) {
    let title = if fresh.len() == 1 {
        "New AI model released".to_string()
    } else {
        format!("{} new AI models released", fresh.len())
    };
    let mut lines: Vec<String> = fresh
        .iter()
        .take(DISCORD_MAX_LISTED)
        .map(|m| format!("**{}** — `{}`", m.name, m.id))
        .collect();
    if fresh.len() > DISCORD_MAX_LISTED {
        lines.push(format!("…and {} more", fresh.len() - DISCORD_MAX_LISTED));
    }
    let body = serde_json::json!({
        "embeds": [{
            "title": title,
            "description": lines.join("\n"),
            "color": 0x5b7cfa
        }]
    });
    let result = reqwest::Client::new()
        .post(webhook)
        .json(&body)
        .timeout(Duration::from_secs(15))
        .send()
        .await;
    if let Err(err) = result {
        eprintln!("model watch: discord notify failed: {err}");
    }
}

async fn tick(app: &AppHandle, store: &PathBuf) -> Result<(), String> {
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

    let Some(known) = load_known(store) else {
        // First run: seed the roster silently so 300 models aren't "news".
        let seeded: BTreeSet<String> = payload
            .data
            .iter()
            .map(|m| base_id(&m.id).to_string())
            .collect();
        save_known(store, &seeded);
        return Ok(());
    };

    let fresh = diff_new(&known, &payload.data);
    if fresh.is_empty() {
        return Ok(());
    }

    let mut updated = known;
    updated.extend(fresh.iter().map(|m| m.id.clone()));
    save_known(store, &updated);

    let webhook = std::env::var("VIBYRA_DISCORD_WEBHOOK_URL")
        .ok()
        .filter(|url| !url.trim().is_empty());
    if let Some(url) = webhook {
        notify_discord(url.trim(), &fresh).await;
    }
    let _ = app.emit("models:released", &fresh);
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
