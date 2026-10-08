//! Moves one file or folder to the system Trash (macOS Trash, Windows Recycle
//! Bin, the freedesktop trash on Linux). Never a permanent delete: when no
//! Trash can be reached the item is left where it is and the error says so.
//! The path always travels as an argument, never inside a script's text.

use std::path::Path;
use std::process::{Command, Stdio};

use crate::{CoreError, CoreResult};

#[cfg(target_os = "macos")]
const MAC_SCRIPT: &str = r#"ObjC.import("Foundation"); function run(argv) { var url = $.NSURL.fileURLWithPath(argv[0]); var ok = $.NSFileManager.defaultManager.trashItemAtURLResultingItemURLError(url, $(), $()); if (!ok) throw new Error("not moved"); }"#;

#[cfg(windows)]
const WINDOWS_SCRIPT: &str = "Add-Type -AssemblyName Microsoft.VisualBasic; $p = $env:VIBYRA_TRASH_PATH; if (Test-Path -LiteralPath $p -PathType Container) { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($p, 'OnlyErrorDialogs', 'SendToRecycleBin') } else { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($p, 'OnlyErrorDialogs', 'SendToRecycleBin') }";

fn failed(detail: &str) -> CoreError {
    CoreError::InvalidPath(format!(
        "The Trash could not take this item ({detail}). It was not deleted."
    ))
}

fn run(mut command: Command) -> CoreResult<()> {
    let output = command
        .stdin(Stdio::null())
        .output()
        .map_err(|error| failed(&error.to_string()))?;
    if output.status.success() {
        return Ok(());
    }
    let why = String::from_utf8_lossy(&output.stderr);
    Err(failed(why.lines().next().unwrap_or("it refused")))
}

#[cfg(target_os = "macos")]
pub fn move_to_trash(path: &Path) -> CoreResult<()> {
    let mut command = Command::new("/usr/bin/osascript");
    command
        .args(["-l", "JavaScript", "-e", MAC_SCRIPT])
        .arg(path);
    run(command)
}

#[cfg(windows)]
pub fn move_to_trash(path: &Path) -> CoreResult<()> {
    let mut command = Command::new("powershell.exe");
    command
        .args(["-NoProfile", "-NonInteractive", "-Command", WINDOWS_SCRIPT])
        .env("VIBYRA_TRASH_PATH", path);
    run(command)
}

#[cfg(not(any(target_os = "macos", windows)))]
pub fn move_to_trash(path: &Path) -> CoreResult<()> {
    let mut gio = Command::new("gio");
    gio.args(["trash", "--"]).arg(path);
    match run(gio) {
        Err(_) => {
            let mut put = Command::new("trash-put");
            put.arg("--").arg(path);
            run(put).map_err(|_| failed("install gio or trash-cli"))
        }
        done => done,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Puts one tiny temp file in the real Trash of whoever runs it, so it is
    /// ignored by default: `cargo test -p vibyra-core trash -- --ignored`.
    #[test]
    #[ignore = "leaves a file in the real Trash"]
    fn a_real_file_leaves_its_folder_for_the_system_trash() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("vibyra trash probe 'quoted'.txt");
        std::fs::write(&file, "x").unwrap();
        move_to_trash(&file).unwrap();
        assert!(!file.exists());
    }

    #[test]
    fn a_missing_item_is_an_error_not_a_delete() {
        let dir = tempfile::tempdir().unwrap();
        assert!(move_to_trash(&dir.path().join("nothing-here.txt")).is_err());
    }
}
