use std::path::{Path, PathBuf};
pub(crate) fn find_claude(projects: &Path, session: &str) -> Option<PathBuf> {
    let name = format!("{session}.jsonl");
    std::fs::read_dir(projects)
        .ok()?
        .flatten()
        .find_map(|entry| {
            let file = entry.path().join(&name);
            let plain = std::fs::symlink_metadata(&file).ok()?.is_file();
            (entry.file_type().ok()?.is_dir() && plain).then_some(file)
        })
}

/// Codex rollouts live under sessions/year/month/day, newest folder first.
/// Symlinked entries are ignored.
pub(crate) fn find_codex(root: &Path, suffix: &str, depth: usize) -> Option<PathBuf> {
    let mut folders = Vec::new();
    for entry in std::fs::read_dir(root).ok()?.flatten() {
        let kind = entry.file_type().ok()?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if kind.is_file() && name.starts_with("rollout-") && name.ends_with(suffix) {
            return Some(entry.path());
        }
        if kind.is_dir() && depth < 3 {
            folders.push(name);
        }
    }
    folders.sort_unstable_by(|a, b| b.cmp(a));
    folders
        .iter()
        .find_map(|name| find_codex(&root.join(name), suffix, depth + 1))
}
