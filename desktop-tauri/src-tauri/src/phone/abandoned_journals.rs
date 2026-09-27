use std::path::{Path, PathBuf};

/// Removes the journal directories earlier engines left behind. The vault and
/// the Railway tools each open their engine in a fresh directory — reusing the
/// previous one would race that engine's teardown — and nothing ever removed
/// the old ones, so every launch and every network change added another (one
/// Mac had over a hundred).
///
/// Only entries of `parent` that `abandoned` names are candidates, never
/// `keep`, and each goes only once its journal lock can be taken, so an engine
/// still running here or in another copy of the app keeps its directory.
/// `journal` maps a candidate to the directory holding its `engine.lock`.
/// Runs on a thread of its own: the first sweep can have a lot to delete.
pub(crate) fn sweep(
    parent: PathBuf,
    keep: PathBuf,
    abandoned: fn(&str) -> bool,
    journal: fn(&Path) -> PathBuf,
) {
    let run = move || {
        let Ok(entries) = std::fs::read_dir(&parent) else {
            return;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let named = entry.file_name().to_str().is_some_and(abandoned);
            if named && path != keep && path.is_dir() {
                vibyra_engine::remove_unowned_state(&journal(&path), &path);
            }
        }
    };
    if cfg!(test) {
        run();
    } else {
        let _ = std::thread::Builder::new()
            .name("vibyra-journal-sweep".into())
            .spawn(run);
    }
}

/// `prefix` followed by exactly `digits` lowercase hex digits.
pub(crate) fn is_named(name: &str, prefix: &str, digits: usize) -> bool {
    name.strip_prefix(prefix).is_some_and(|rest| {
        rest.len() == digits && rest.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_unowned_directories_with_generated_names_are_removed() {
        let parent = tempfile::tempdir().unwrap();
        let make = |name: &str| {
            let dir = parent.path().join(name);
            std::fs::create_dir_all(&dir).unwrap();
            std::fs::write(dir.join("engine.lock"), b"").unwrap();
            dir
        };
        let stale = make("vault-0123456789abcdef");
        let kept = make("vault-fedcba9876543210");
        let foreign = make("vault-notes");
        let held = parent.path().join("vault-00000000000000aa");
        let notes = tempfile::tempdir().unwrap();
        let _live =
            vibyra_engine::Engine::new_read_only(held.clone(), "Notes".into(), notes.path().into())
                .unwrap();
        sweep(
            parent.path().into(),
            kept.clone(),
            |name| is_named(name, "vault-", 16),
            Path::to_path_buf,
        );
        assert!(!stale.exists());
        assert!(kept.exists() && foreign.exists() && held.exists());
    }
}
