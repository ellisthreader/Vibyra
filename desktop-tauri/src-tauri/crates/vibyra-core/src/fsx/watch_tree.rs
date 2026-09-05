use std::collections::HashSet;
use std::path::{Path, PathBuf};

use notify::{RecursiveMode, Watcher};

pub(super) struct RegisteredTree {
    pub root: PathBuf,
    paths: HashSet<PathBuf>,
}

impl RegisteredTree {
    pub fn new(root: PathBuf) -> Self {
        Self {
            root,
            paths: HashSet::new(),
        }
    }

    pub fn includes(&self, path: &Path) -> bool {
        path.strip_prefix(&self.root)
            .is_ok_and(|relative| !super::ignored(relative))
    }

    #[cfg(windows)]
    pub fn refresh(&mut self, watcher: &mut impl Watcher) -> notify::Result<()> {
        // Windows cannot rename a parent while descendant directory handles
        // are open. One recursive root handle preserves source-folder renames;
        // the callback filters generated paths before bounded queue admission.
        if self.paths.is_empty() {
            watcher.watch(&self.root, RecursiveMode::Recursive)?;
            self.paths.insert(self.root.clone());
        }
        Ok(())
    }

    #[cfg(not(windows))]
    pub fn refresh(&mut self, watcher: &mut impl Watcher) -> notify::Result<()> {
        // A renamed/replaced directory can retain its native watch identity.
        // Remove old registrations before adding new paths to the same inode.
        // The root stays watched; callers also invalidate the whole file tree.
        for path in &self.paths {
            if path != &self.root {
                let _ = watcher.unwatch(path);
            }
        }
        self.paths.retain(|path| path == &self.root);
        let mut found = HashSet::new();
        let mut remaining = vec![self.root.clone()];
        while let Some(path) = remaining.pop() {
            if !path.is_dir() || !self.includes(&path) {
                continue;
            }
            if !self.paths.contains(&path) {
                // Register before enumerating children to observe concurrent creates.
                watcher.watch(&path, RecursiveMode::NonRecursive)?;
                self.paths.insert(path.clone());
            }
            found.insert(path.clone());
            for entry in std::fs::read_dir(path)?.flatten() {
                // Keep watches within the selected tree, without following
                // dependency symlinks back into an otherwise excluded tree.
                if entry.file_type().is_ok_and(|kind| kind.is_dir()) && self.includes(&entry.path())
                {
                    remaining.push(entry.path());
                }
            }
        }
        for stale in self.paths.difference(&found) {
            let _ = watcher.unwatch(stale);
        }
        self.paths = found;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registers_source_directories_without_dependency_trees() {
        let tmp = tempfile::tempdir().unwrap();
        for path in [
            "src/nested",
            "node_modules/pkg/nested",
            "target/debug",
            ".git/objects",
        ] {
            std::fs::create_dir_all(tmp.path().join(path)).unwrap();
        }
        let mut watcher = notify::RecommendedWatcher::new(
            |_: notify::Result<notify::Event>| {},
            notify::Config::default(),
        )
        .unwrap();
        let mut tree = RegisteredTree::new(tmp.path().to_path_buf());
        tree.refresh(&mut watcher).unwrap();
        assert_eq!(tree.paths.len(), if cfg!(windows) { 1 } else { 3 });
        assert!(tree.paths.contains(tmp.path()));
        assert!(!tree.includes(&tmp.path().join("node_modules/pkg/nested")));
        std::fs::rename(tmp.path().join("src"), tmp.path().join("renamed")).unwrap();
        tree.refresh(&mut watcher).unwrap();
        assert_eq!(tree.paths.len(), if cfg!(windows) { 1 } else { 3 });
        assert!(tree.includes(&tmp.path().join("renamed/nested")));
        #[cfg(not(windows))]
        assert!(tree.paths.contains(&tmp.path().join("renamed/nested")));
        assert!(!tree.paths.contains(&tmp.path().join("src/nested")));
    }
}
