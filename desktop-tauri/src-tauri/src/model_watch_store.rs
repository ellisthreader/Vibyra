use std::path::Path;

use serde::{Deserialize, Serialize};
use vibyra_core::fsx::write_private_atomic;

use crate::model_watch::ReleasedModel;

#[derive(Default, Serialize, Deserialize)]
pub(crate) struct WatchStore {
    pub(crate) cursor: u64,
    #[serde(default)]
    pub(crate) pending: Vec<ReleasedModel>,
}

pub(crate) fn merge_releases(
    store: &mut WatchStore,
    cursor: u64,
    releases: Vec<ReleasedModel>,
) -> Result<(), String> {
    if cursor < store.cursor {
        return Err("model release feed cursor moved backwards".into());
    }
    store.cursor = cursor;
    for model in releases {
        if !store.pending.iter().any(|pending| pending.id == model.id) {
            store.pending.push(model);
        }
    }
    Ok(())
}

pub(crate) fn load_store(path: &Path) -> Result<Option<WatchStore>, String> {
    let raw = match std::fs::read_to_string(path) {
        Ok(raw) => raw,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err("could not read the model release state".into()),
    };
    serde_json::from_str(&raw)
        .map(Some)
        .map_err(|_| "model release state is invalid; refusing to reseed it".into())
}

pub(crate) fn save_store(path: &Path, store: &WatchStore) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)
            .map_err(|_| "could not create the model release state directory".to_string())?;
    }
    let json = serde_json::to_vec(store)
        .map_err(|_| "could not encode the model release state".to_string())?;
    write_private_atomic(path, &json).map_err(|_| "could not save the model release state".into())
}
