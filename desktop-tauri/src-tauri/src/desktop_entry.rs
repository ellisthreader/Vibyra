#![cfg(target_os = "linux")]

// A raw AppImage has no desktop integration: GNOME labels the window with its
// WM_CLASS and has no icon for it at startup. Install a user-level desktop
// entry and icon on launch so docks and launchers show "Vibyra" and the V mark.
// Rewritten whenever the AppImage path changes, so a moved file keeps working.
pub fn install() {
    let Ok(appimage) = std::env::var("APPIMAGE") else {
        return;
    };
    let data_home = std::env::var("XDG_DATA_HOME")
        .ok()
        .filter(|value| !value.is_empty())
        .or_else(|| {
            std::env::var("HOME")
                .ok()
                .filter(|home| !home.is_empty())
                .map(|home| format!("{home}/.local/share"))
        });
    let Some(data_home) = data_home else { return };
    let icon_dir = format!("{data_home}/icons/hicolor/256x256/apps");
    let applications_dir = format!("{data_home}/applications");
    let entry = format!(
        "[Desktop Entry]\nType=Application\nName=Vibyra\nComment=Vibyra AI terminal workspace\nExec=\"{appimage}\" %U\nIcon=vibyra\nTerminal=false\nCategories=Development;\nStartupWMClass=Vibyra\n"
    );
    let _ = std::fs::create_dir_all(&icon_dir);
    let _ = std::fs::create_dir_all(&applications_dir);
    let _ = std::fs::write(
        format!("{icon_dir}/vibyra.png"),
        include_bytes!("../icons/128x128@2x.png"),
    );
    let entry_path = format!("{applications_dir}/vibyra.desktop");
    if std::fs::read_to_string(&entry_path).unwrap_or_default() != entry {
        let _ = std::fs::write(&entry_path, entry);
        let _ = std::process::Command::new("update-desktop-database")
            .arg(&applications_dir)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn();
        let _ = std::process::Command::new("gtk-update-icon-cache")
            .args(["-f", "-t", &format!("{data_home}/icons/hicolor")])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn();
    }
}
