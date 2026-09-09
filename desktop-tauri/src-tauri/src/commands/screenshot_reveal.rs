//! "Show in folder" for a saved screenshot. Only paths inside the screenshot
//! folder are accepted, so the tray can never be talked into opening
//! something else.

use std::path::Path;
use std::process::{Command, Stdio};

use tauri::State;

use crate::state::AppState;

use super::screenshot::{saved_screenshot_path, screenshot_dir};

#[tauri::command]
pub async fn reveal_screenshot(state: State<'_, AppState>, path: String) -> Result<(), String> {
    let dir = screenshot_dir(&state);
    super::run_blocking(move || reveal(&saved_screenshot_path(&dir, &path)?)).await
}

/// `file://` URI for a local path, percent-encoded per segment. `:` is left
/// alone so a Windows drive letter still reads as `file:///C:/…`.
#[cfg(any(target_os = "linux", test))]
pub(super) fn file_uri(path: &Path) -> String {
    let normalized = path.to_string_lossy().replace('\\', "/");
    let rooted = if normalized.starts_with('/') {
        normalized
    } else {
        format!("/{normalized}")
    };
    let encoded = rooted
        .split('/')
        .map(|segment| {
            segment
                .bytes()
                .map(|byte| match byte {
                    b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' | b':' => {
                        (byte as char).to_string()
                    }
                    _ => format!("%{byte:02X}"),
                })
                .collect::<String>()
        })
        .collect::<Vec<_>>()
        .join("/");
    format!("file://{encoded}")
}

fn spawn(mut command: Command) -> Result<(), String> {
    command
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Could not open the screenshot folder: {error}"))
}

#[cfg(target_os = "linux")]
fn reveal(path: &Path) -> Result<(), String> {
    // The freedesktop interface selects the file itself, but not every desktop
    // ships a provider for it — `--print-reply` is what makes a missing one a
    // non-zero exit here instead of a silent no-op, so the folder open behind
    // it actually runs.
    let selected = Command::new("dbus-send")
        .args([
            "--session",
            "--print-reply",
            "--reply-timeout=5000",
            "--dest=org.freedesktop.FileManager1",
            "--type=method_call",
            "/org/freedesktop/FileManager1",
            "org.freedesktop.FileManager1.ShowItems",
        ])
        .arg(format!("array:string:{}", file_uri(path)))
        .arg("string:")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
    if matches!(selected, Ok(status) if status.success()) {
        return Ok(());
    }
    let folder = path.parent().unwrap_or(path);
    let mut command = Command::new("xdg-open");
    command.arg(folder);
    spawn(command)
}

#[cfg(target_os = "macos")]
fn reveal(path: &Path) -> Result<(), String> {
    let mut command = Command::new("open");
    command.arg("-R").arg(path);
    spawn(command)
}

#[cfg(target_os = "windows")]
fn reveal(path: &Path) -> Result<(), String> {
    // Explorer takes the selection as one comma-joined argument and exits
    // non-zero even when it worked, so the status is deliberately ignored.
    let mut command = Command::new("explorer");
    command.arg(format!("/select,{}", path.display()));
    spawn(command)
}
