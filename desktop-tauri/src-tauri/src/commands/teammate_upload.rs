use crate::{account_api, state::AppState};
use base64::Engine;
use serde_json::Value;
use tauri::State;

/// Upload only bytes explicitly selected in the renderer; never read a caller-selected path.
#[tauri::command]
pub async fn teammate_upload(
    state: State<'_, AppState>,
    name: String,
    mime: String,
    data: String,
) -> Result<Value, String> {
    if name.len() > 255 || data.len() > 2_800_000 {
        return Err("Attach a file under 2 MB.".into());
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data)
        .map_err(|_| "Unreadable attachment.")?;
    if bytes.len() > 2 * 1024 * 1024 {
        return Err("Attach a file under 2 MB.".into());
    }
    let token = state.account.token().ok_or("Sign in to attach files.")?;
    let part = reqwest::multipart::Part::bytes(bytes)
        .file_name(name)
        .mime_str(&mime)
        .map_err(|_| "Unsupported file type.")?;
    let response = reqwest::Client::new()
        .post(format!("{}/api/vibes/attachments", account_api::base_url()))
        .bearer_auth(&token)
        .header("Accept", "application/json")
        .timeout(std::time::Duration::from_secs(60))
        .multipart(reqwest::multipart::Form::new().part("file", part))
        .send()
        .await
        .map_err(|_| "Upload interrupted. Select the file again to retry.")?;
    let status = response.status().as_u16();
    let value: Value = response
        .json()
        .await
        .map_err(|_| "Unreadable upload response.")?;
    if state.account.token().as_deref() != Some(token.as_str()) {
        return Err("Your account changed.".into());
    }
    if !(200..300).contains(&status) {
        return Err(format!(
            "{}: {}",
            status,
            account_api::error_detail(&value, status)
        ));
    }
    Ok(value)
}
