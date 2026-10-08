//! Deploy command presets. They are only offered when the CLI is installed, and
//! a preset is text for a terminal: Vibyra fills the line in and never presses Enter.

use std::path::{Path, PathBuf};

use serde::Serialize;

struct Preset {
    id: &'static str,
    label: &'static str,
    /// Programs that satisfy the preset, first match wins.
    programs: &'static [&'static str],
    command: &'static str,
}

const PRESETS: [Preset; 4] = [
    Preset {
        id: "vercel",
        label: "Vercel",
        programs: &["vercel"],
        command: "vercel",
    },
    Preset {
        id: "netlify",
        label: "Netlify",
        programs: &["netlify"],
        command: "netlify deploy",
    },
    Preset {
        id: "railway",
        label: "Railway",
        programs: &["railway"],
        command: "railway up",
    },
    Preset {
        id: "fly",
        label: "Fly.io",
        programs: &["fly", "flyctl"],
        command: "fly deploy",
    },
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeployPreset {
    pub id: String,
    pub label: String,
    /// The text that is placed in a terminal, without a newline.
    pub command: String,
}

/// The executable named `program` in one of the folders of `path`, if any.
pub fn find_in_path(program: &str, path: &std::ffi::OsStr, windows: bool) -> Option<PathBuf> {
    let extensions: &[&str] = if windows {
        &["", ".exe", ".cmd", ".bat"]
    } else {
        &[""]
    };
    std::env::split_paths(path).find_map(|dir| {
        extensions.iter().find_map(|ext| {
            let candidate = dir.join(format!("{program}{ext}"));
            is_executable(&candidate).then_some(candidate)
        })
    })
}

fn is_executable(path: &Path) -> bool {
    let Ok(meta) = std::fs::metadata(path) else {
        return false;
    };
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        meta.is_file() && meta.permissions().mode() & 0o111 != 0
    }
    #[cfg(not(unix))]
    {
        meta.is_file()
    }
}

/// Presets whose CLI is on `path`.
pub fn available_on(path: &std::ffi::OsStr, windows: bool) -> Vec<DeployPreset> {
    PRESETS
        .iter()
        .filter(|p| {
            p.programs
                .iter()
                .any(|name| find_in_path(name, path, windows).is_some())
        })
        .map(|p| DeployPreset {
            id: p.id.into(),
            label: p.label.into(),
            command: p.command.into(),
        })
        .collect()
}

/// Presets for the PATH this process (and so every terminal it starts) has.
pub fn available() -> Vec<DeployPreset> {
    available_on(&std::env::var_os("PATH").unwrap_or_default(), cfg!(windows))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(unix)]
    fn tool(dir: &Path, name: &str, mode: u32) {
        use std::os::unix::fs::PermissionsExt;
        let file = dir.join(name);
        std::fs::write(&file, "#!/bin/sh\n").unwrap();
        std::fs::set_permissions(&file, std::fs::Permissions::from_mode(mode)).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn only_installed_clis_are_offered() {
        let bin = tempfile::tempdir().unwrap();
        tool(bin.path(), "vercel", 0o755);
        tool(bin.path(), "flyctl", 0o755);
        tool(bin.path(), "railway", 0o644); // present but not executable
        let ids: Vec<_> = available_on(bin.path().as_os_str(), false)
            .into_iter()
            .map(|p| p.id)
            .collect();
        assert_eq!(ids, ["vercel", "fly"]);
    }

    #[test]
    fn an_empty_path_offers_nothing_and_commands_never_end_in_a_newline() {
        assert!(available_on(std::ffi::OsStr::new(""), false).is_empty());
        assert!(PRESETS
            .iter()
            .all(|p| !p.command.contains('\n') && !p.command.contains('\r')));
    }
}
