//! Where in a project to look for apps. The conventional folders come first,
//! in a fixed order, so a typical project behaves as it always did; a bounded
//! walk then finds the apps of any other monorepo layout.

use std::fs;
use std::path::{Path, PathBuf};

pub(crate) const APP_ROOTS: [&str; 16] = [
    ".",
    "frontend",
    "client",
    "web",
    "website",
    "site",
    "ui",
    "dashboard",
    "app",
    "mobile",
    "apps/web",
    "apps/client",
    "apps/mobile",
    "packages/web",
    "packages/app",
    "packages/mobile",
];

const MAX_DEPTH: usize = 3;
const MAX_FOLDERS: usize = 400;

/// Files that say a folder is an app of its own.
const APP_MARKERS: [&str; 7] = [
    "package.json",
    "composer.json",
    "manage.py",
    "pubspec.yaml",
    "go.mod",
    "Gemfile",
    "app.py",
];

/// Folders that hold dependencies, build output or tooling, never an app.
const SKIPPED: [&str; 14] = [
    "node_modules",
    "vendor",
    "target",
    "dist",
    "build",
    "out",
    "coverage",
    "venv",
    "env",
    "__pycache__",
    "Pods",
    "DerivedData",
    "bower_components",
    "tmp",
];

/// Folders below `root` that look like apps and are not already a conventional root.
pub(crate) fn discover(root: &Path) -> Vec<PathBuf> {
    let mut found = Vec::new();
    let mut seen = 0;
    walk(root, root, 0, &mut seen, &mut found);
    found
}

fn walk(root: &Path, dir: &Path, depth: usize, seen: &mut usize, found: &mut Vec<PathBuf>) {
    if depth >= MAX_DEPTH {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let mut folders = entries
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .filter(|entry| {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            !name.starts_with('.') && !SKIPPED.contains(&name.as_ref())
        })
        .map(|entry| entry.path())
        .collect::<Vec<_>>();
    folders.sort();
    for folder in folders {
        *seen += 1;
        if *seen > MAX_FOLDERS {
            return;
        }
        if APP_MARKERS
            .iter()
            .any(|marker| folder.join(marker).is_file())
            && !is_conventional(root, &folder)
        {
            found.push(folder.clone());
        }
        walk(root, &folder, depth + 1, seen, found);
    }
}

fn is_conventional(root: &Path, folder: &Path) -> bool {
    APP_ROOTS
        .iter()
        .any(|relative| root.join(relative) == folder)
}

#[cfg(test)]
mod tests {
    use tempfile::tempdir;

    use super::*;

    #[test]
    fn finds_apps_in_unconventional_layouts_and_skips_dependencies() {
        let dir = tempdir().unwrap();
        for app in [
            "services/api",
            "apps/docs",
            "node_modules/pkg",
            "apps/web",
            "deep/a/b/c",
        ] {
            fs::create_dir_all(dir.path().join(app)).unwrap();
            fs::write(dir.path().join(app).join("package.json"), "{}").unwrap();
        }
        let found = discover(dir.path())
            .iter()
            .map(|path| {
                path.strip_prefix(dir.path())
                    .unwrap()
                    .to_string_lossy()
                    .into_owned()
            })
            .collect::<Vec<_>>();
        assert!(found.contains(&"services/api".to_owned()));
        assert!(found.contains(&"apps/docs".to_owned()));
        assert!(!found.iter().any(|path| path.contains("node_modules")));
        assert!(
            !found.contains(&"apps/web".to_owned()),
            "conventional roots keep their place"
        );
        assert!(
            !found.iter().any(|path| path.starts_with("deep/a/b")),
            "walk is bounded"
        );
    }
}
