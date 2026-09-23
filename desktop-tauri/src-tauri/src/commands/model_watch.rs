use crate::model_watch::{self, ReleasedModel};

#[tauri::command]
pub async fn take_model_releases() -> Result<Vec<ReleasedModel>, String> {
    model_watch::take_pending().await
}
