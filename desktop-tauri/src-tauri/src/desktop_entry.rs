#![cfg(target_os = "linux")]

// A raw AppImage has no desktop integration: GNOME labels the window with its
// WM_CLASS and has no icon for it at startup. Install a user-level desktop
// entry and icon on launch so docks and launchers show "Vibyra" and the V mark.
// Rewritten whenever the AppImage path changes, so a moved file keeps working.
#[cfg(target_os = "linux")]
pub fn install() {
    let Ok(appimage) = std::env::var("APPIMAGE") else {
        return;
    };
    let Some(appimage) = escape_exec(&appimage) else {
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
        "[Desktop Entry]\nType=Application\nName=Vibyra\nComment=Vibyra AI terminal workspace\nExec=\"{appimage}\"\nIcon=vibyra\nTerminal=false\nCategories=Development;\nStartupWMClass=Vibyra\n"
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
        refresh("update-desktop-database", &[&applications_dir]);
        refresh(
            "gtk-update-icon-cache",
            &["-f", "-t", &format!("{data_home}/icons/hicolor")],
        );
    }
}

// Desktop-entry string escaping is applied before Exec argument unquoting.
// Percent is escaped separately so a filename never becomes a field code.
fn escape_exec(path: &str) -> Option<String> {
    if !std::path::Path::new(path).is_absolute() || path.chars().any(char::is_control) {
        return None;
    }
    let mut escaped = String::new();
    for character in path.chars() {
        match character {
            '\\' => escaped.push_str("\\\\\\\\"),
            '"' | '`' | '$' => {
                escaped.push_str("\\\\");
                escaped.push(character);
            }
            '%' => escaped.push_str("%%"),
            _ => escaped.push(character),
        }
    }
    Some(escaped)
}

#[cfg(target_os = "linux")]
fn refresh(program: &str, args: &[&str]) {
    let mut command = std::process::Command::new(program);
    vibyra_core::launch_env::sanitize_command(&mut command);
    let _ = command
        .args(args)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_moved_appimage_remains_one_literal_exec_argument() {
        assert_eq!(
            escape_exec("/home/ellis/My Apps/Vibyra.AppImage").as_deref(),
            Some("/home/ellis/My Apps/Vibyra.AppImage")
        );
        assert_eq!(
            escape_exec("/tmp/%\"`$\\.AppImage").unwrap(),
            r#"/tmp/%%\\"\\`\\$\\\\.AppImage"#
        );
        for path in ["relative.AppImage", "/tmp/name\nExec=other", "/tmp/name\0"] {
            assert!(escape_exec(path).is_none());
        }
    }
}
