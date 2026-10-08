//! portable-pty calls CreateProcess directly, so a Windows npm batch shim is
//! resolved to its fixed installed executable or JS entry point without a shell.
use std::{
    ffi::OsString,
    path::{Path, PathBuf},
};

pub(crate) struct Program {
    pub executable: PathBuf,
    pub arguments: Vec<OsString>,
}

fn direct(executable: PathBuf) -> Program {
    Program {
        executable,
        arguments: Vec::new(),
    }
}

fn on_path(name: &str, suffixes: &[&str]) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path)
        .flat_map(|dir| {
            suffixes
                .iter()
                .map(move |suffix| dir.join(format!("{name}{suffix}")))
        })
        .find(|candidate| candidate.is_file())
}

pub(crate) fn find(provider: &str) -> Option<Program> {
    if !matches!(provider, "claude" | "codex") {
        return None;
    }
    let suffixes: &[&str] = if cfg!(windows) {
        &[".exe", ".cmd", ".bat", ""]
    } else {
        &[""]
    };
    let path = on_path(provider, suffixes)?;
    if cfg!(windows)
        && provider == "claude"
        && path
            .extension()
            .and_then(|s| s.to_str())
            .is_some_and(|s| s.eq_ignore_ascii_case("cmd") || s.eq_ignore_ascii_case("bat"))
    {
        windows_claude(&path, || on_path("node", &[".exe"]))
    } else {
        Some(direct(path))
    }
}

fn windows_claude(shim: &Path, node: impl FnOnce() -> Option<PathBuf>) -> Option<Program> {
    let prefix = shim.parent()?;
    let package = prefix
        .join("node_modules")
        .join("@anthropic-ai")
        .join("claude-code");
    let native = package.join("bin").join("claude.exe");
    if native.is_file() {
        return Some(direct(native));
    }
    let script = package.join("cli.js");
    if !script.is_file() {
        return None;
    }
    let sibling = prefix.join("node.exe");
    let executable = if sibling.is_file() { sibling } else { node()? };
    Some(Program {
        executable,
        arguments: vec![script.into_os_string()],
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn windows_npm_uses_a_fixed_native_or_js_entry_and_never_the_batch_shim() {
        let dir = tempfile::tempdir().unwrap();
        let prefix = dir.path().join("Profile with spaces & punctuation");
        let package = prefix
            .join("node_modules")
            .join("@anthropic-ai")
            .join("claude-code");
        std::fs::create_dir_all(package.join("bin")).unwrap();
        let shim = prefix.join("claude.cmd");
        std::fs::write(&shim, "batch fixture must never execute").unwrap();
        assert!(windows_claude(&shim, || None).is_none());
        std::fs::write(package.join("cli.js"), "js fixture").unwrap();
        let node = prefix.join("node.exe");
        std::fs::write(&node, "node fixture").unwrap();
        let js = windows_claude(&shim, || panic!("prefer sibling node")).unwrap();
        assert_eq!(js.executable, node);
        assert_eq!(js.arguments, vec![package.join("cli.js").into_os_string()]);
        let native = package.join("bin").join("claude.exe");
        std::fs::write(&native, "native fixture").unwrap();
        let exe = windows_claude(&shim, || panic!("native needs no node")).unwrap();
        assert_eq!(exe.executable, native);
        assert!(exe.arguments.is_empty());
    }
}
