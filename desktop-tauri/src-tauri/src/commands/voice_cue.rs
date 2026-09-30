/// The F8 confirmation must play even when the global shortcut arrives while
/// the webview is in the background and Web Audio has no user activation.
#[tauri::command]
pub fn play_voice_cue(kind: String) -> Result<bool, String> {
    let name = match kind.as_str() {
        "start" => "Tink",
        "stop" => "Pop",
        _ => return Err("Unknown microphone cue".into()),
    };
    #[cfg(target_os = "macos")]
    {
        let path = format!("/System/Library/Sounds/{name}.aiff");
        std::thread::Builder::new()
            .name("vibyra-microphone-cue".into())
            .spawn(move || {
                let _ = std::process::Command::new("/usr/bin/afplay")
                    .args(["-v", "0.28", &path])
                    .status();
            })
            .map_err(|error| error.to_string())?;
        Ok(true)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = name;
        Ok(false)
    }
}
