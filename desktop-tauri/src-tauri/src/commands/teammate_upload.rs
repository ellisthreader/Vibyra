use crate::{account_api, state::AppState};
use base64::Engine;
use serde_json::Value;
use tauri::State;

const LIMIT: usize = 2 * 1024 * 1024;
const TEXT_EXTENSIONS: &[&str] = &[
    "txt", "md", "markdown", "csv", "tsv", "json", "yaml", "yml", "xml", "html", "css", "scss",
    "js", "jsx", "ts", "tsx", "mjs", "py", "rb", "go", "rs", "java", "kt", "swift", "php", "c",
    "h", "cpp", "cs", "sql", "sh", "toml", "ini", "log",
];
const IMAGES: &[&str] = &[
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
    "image/gif",
];

/// Agent v2 attachments (§6d): a photo, a PDF or a text file, at most 2 MB, with a sane name. The
/// server validates again; this keeps an unsuitable file from leaving the device at all.
fn v2_problem(name: &str, mime: &str, size: usize) -> Option<&'static str> {
    if size == 0 || size > LIMIT {
        return Some(if size == 0 {
            "That file is empty."
        } else {
            "Attach a file under 2 MB."
        });
    }
    if name.is_empty() || name.chars().count() > 200 || name.chars().any(char::is_control) {
        return Some("Rename the file (up to 200 characters) and try again.");
    }
    let mime = mime
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    let extension = name
        .rsplit_once('.')
        .map(|(_, e)| e.to_ascii_lowercase())
        .unwrap_or_default();
    let known_text = TEXT_EXTENSIONS.contains(&extension.as_str());
    if IMAGES.contains(&mime.as_str())
        || mime == "application/pdf"
        || mime.starts_with("text/")
        || known_text
    {
        None
    } else {
        Some("Attach a photo, a PDF or a text file.")
    }
}

fn upload_route(agent_v2: bool) -> &'static str {
    if agent_v2 {
        "api/agents/v2/attachments"
    } else {
        "api/vibes/attachments"
    }
}

/// Upload only bytes explicitly selected in the renderer; never read a caller-selected path.
/// `agent_v2` sends them to the Agent v2 run attachments instead of the phone-chat ones.
#[tauri::command]
pub async fn teammate_upload(
    state: State<'_, AppState>,
    name: String,
    mime: String,
    data: String,
    agent_v2: Option<bool>,
) -> Result<Value, String> {
    let v2 = agent_v2 == Some(true);
    if name.len() > 255 || data.len() > 2_800_000 {
        return Err("Attach a file under 2 MB.".into());
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data)
        .map_err(|_| "Unreadable attachment.")?;
    if bytes.len() > LIMIT {
        return Err("Attach a file under 2 MB.".into());
    }
    if let Some(problem) = v2.then(|| v2_problem(&name, &mime, bytes.len())).flatten() {
        return Err(problem.into());
    }
    let token = state.account.token().ok_or("Sign in to attach files.")?;
    let part = reqwest::multipart::Part::bytes(bytes)
        .file_name(name)
        .mime_str(&mime)
        .map_err(|_| "Unsupported file type.")?;
    let response = crate::http_client::shared()
        .post(format!("{}/{}", account_api::base_url(), upload_route(v2)))
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn v1_and_v2_uploads_go_to_their_own_routes() {
        assert_eq!(upload_route(false), "api/vibes/attachments");
        assert_eq!(upload_route(true), "api/agents/v2/attachments");
    }

    #[test]
    fn v2_uploads_are_a_photo_a_pdf_or_text_under_two_megabytes() {
        for (name, mime) in [
            ("photo.jpg", "image/jpeg"),
            ("scan.HEIC", "image/heic"),
            ("a.png", "image/png; charset=binary"),
            ("brief.pdf", "application/pdf"),
            ("notes.txt", "text/plain"),
            ("data.csv", "text/csv"),
            ("config.json", "application/json"),
            ("main.rs", "application/octet-stream"),
            ("run.SH", ""),
        ] {
            assert_eq!(v2_problem(name, mime, 1024), None, "{name} {mime}");
        }
        assert_eq!(v2_problem("a.txt", "text/plain", LIMIT), None);
        assert_eq!(
            v2_problem("a.txt", "text/plain", LIMIT + 1),
            Some("Attach a file under 2 MB.")
        );
        assert!(v2_problem("a.txt", "text/plain", 0).is_some());
        for (name, mime) in [
            ("tool.exe", "application/x-msdownload"),
            ("movie.mp4", "video/mp4"),
            ("archive.zip", "application/zip"),
            ("noextension", "application/octet-stream"),
            ("a.svg", "image/svg+xml"),
            (
                "doc.docx",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ),
        ] {
            assert_eq!(
                v2_problem(name, mime, 10),
                Some("Attach a photo, a PDF or a text file."),
                "{name}"
            );
        }
        assert!(v2_problem("", "text/plain", 10).is_some());
        assert!(v2_problem(&"n".repeat(201), "text/plain", 10).is_some());
        assert!(v2_problem(&format!("{}.txt", "n".repeat(196)), "text/plain", 10).is_none());
        assert!(v2_problem("bad\u{0}name.txt", "text/plain", 10).is_some());
        assert!(v2_problem("line\nbreak.txt", "text/plain", 10).is_some());
    }
}
