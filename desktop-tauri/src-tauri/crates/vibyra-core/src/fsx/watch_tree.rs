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
