use std::path::{Path, PathBuf};
use std::sync::LazyLock;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;
use vibyra_core::settings::Settings;

use crate::model_watch_store::{load_store, merge_releases, save_store};

const POLL_INTERVAL: Duration = Duration::from_secs(5 * 60);
static STORE_LOCK: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ReleasedModel {
    pub id: String,
    pub name: String,
}

#[derive(Deserialize)]
struct FeedModel {
    id: String,
    name: String,
}

#[derive(Deserialize)]
struct ReleaseFeed {
    cursor: u64,
    releases: Vec<FeedModel>,
}

fn store_path() -> PathBuf {
    Settings::default_path()
        .parent()
        .map(|dir| dir.join("model-releases.json"))
        .unwrap_or_else(|| std::env::temp_dir().join("vibyra-model-releases.json"))
}

async fn fetch_feed(cursor: Option<u64>) -> Result<ReleaseFeed, String> {
    let url = format!(
        "{}/web-api/openrouter/releases",
        crate::account_api::base_url()
    );
    let mut request = crate::http_client::shared()
        .get(url)
        .header("Accept", "application/json")
        .timeout(Duration::from_secs(8));
    if let Some(cursor) = cursor {
        request = request.query(&[("after", cursor)]);
    }
    request
        .send()
        .await
        .map_err(|_| "model release feed is unavailable".to_string())?
        .error_for_status()
        .map_err(|_| "model release feed returned an error".to_string())?
        .json::<ReleaseFeed>()
        .await
        .map_err(|_| "model release feed was invalid".to_string())
}

async fn tick(app: &AppHandle, path: &Path) -> Result<(), String> {
    for _ in 0..4 {
        let cursor = {
            let _guard = STORE_LOCK.lock().await;
            load_store(path)?.map(|store| store.cursor)
        };
        let feed = fetch_feed(cursor).await?;
        let more = feed.releases.len() == 100;
        let has_pending = {
            let _guard = STORE_LOCK.lock().await;
            let mut store = load_store(path)?.unwrap_or_default();
            merge_releases(
                &mut store,
                feed.cursor,
                feed.releases
                    .into_iter()
                    .map(|model| ReleasedModel {
                        id: model.id,
                        name: model.name,
                    })
                    .collect(),
            )?;
            save_store(path, &store)?;
            !store.pending.is_empty()
        };
        if has_pending {
            let _ = app.emit("models:available", ());
        }
        if !more {
            break;
        }
    }
    Ok(())
}

pub async fn take_pending() -> Result<Vec<ReleasedModel>, String> {
    take_pending_from(&store_path()).await
}

pub(crate) async fn take_pending_from(path: &Path) -> Result<Vec<ReleasedModel>, String> {
    let _guard = STORE_LOCK.lock().await;
    let Some(mut store) = load_store(path)? else {
        return Ok(Vec::new());
    };
    let pending = std::mem::take(&mut store.pending);
    if !pending.is_empty() {
        save_store(path, &store)?;
    }
    Ok(pending)
}

pub fn spawn(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let path = store_path();
        loop {
            if let Err(error) = tick(&app, &path).await {
                eprintln!("model watch: {error}");
            }
            tokio::time::sleep(POLL_INTERVAL).await;
        }
    });
}
