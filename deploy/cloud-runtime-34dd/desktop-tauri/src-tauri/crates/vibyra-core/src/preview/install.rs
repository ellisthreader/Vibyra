//! Which package manager a project uses, whether its dependencies are in
//! place, and the install Run performs first when they are not.

use std::path::{Path, PathBuf};

use super::types::ProcessSpec;

const LOCKFILES: [(&str, &str); 5] = [
    ("pnpm-lock.yaml", "pnpm"),
    ("yarn.lock", "yarn"),
    ("bun.lockb", "bun"),
    ("bun.lock", "bun"),
    ("package-lock.json", "npm"),
];

/// `app` and every folder above it up to the project root: a monorepo keeps
/// its lockfile and `node_modules` at the top, not beside each app.
fn chain<'a>(app: &'a Path, project: &Path) -> Vec<&'a Path> {
    let mut found = Vec::new();
    for dir in app.ancestors() {
        found.push(dir);
        if dir == project {
            break;
        }
        if !dir.starts_with(project) {
            return vec![app];
        }
    }
    found
}

/// The package manager and the folder its install runs in. A lockfile wins,
/// then the manifest's own `packageManager` field, then npm.
pub(crate) fn resolve_manager(
    app: &Path,
    project: &Path,
    declared: Option<&str>,
) -> (&'static str, PathBuf) {
    for dir in chain(app, project) {
        if let Some((_, manager)) = LOCKFILES.iter().find(|(file, _)| dir.join(file).is_file()) {
            return (manager, dir.to_owned());
        }
    }
    let manager = match declared.and_then(|name| name.split('@').next()) {
        Some("pnpm") => "pnpm",
        Some("yarn") => "yarn",
        Some("bun") => "bun",
        _ => "npm",
    };
    (manager, app.to_owned())
}

/// True when the project lists dependencies but the tool Run would start is
/// nowhere to be found, which is what a fresh clone looks like.
pub(crate) fn missing_node_modules(app: &Path, project: &Path, tool: &str, has_deps: bool) -> bool {
    if !has_deps {
        return false;
    }
    let dirs = chain(app, project);
    // Plug'n'Play keeps no node_modules at all.
    if dirs.iter().any(|dir| dir.join(".pnp.cjs").is_file()) {
        return false;
    }
    !dirs.iter().any(|dir| {
        let modules = dir.join("node_modules");
        let bin = modules.join(".bin");
        // No particular tool to look for (a plain Node server): any install will do.
        if tool.is_empty() {
            modules.is_dir()
        } else {
            bin.join(tool).exists() || bin.join(format!("{tool}.cmd")).exists()
        }
    })
}

pub(crate) fn node_install(manager: &str, workspace: &Path) -> ProcessSpec {
    let args: &[&str] = match manager {
        "npm" => &["install", "--no-audit", "--no-fund"],
        _ => &["install"],
    };
    ProcessSpec {
        label: "Install".into(),
        program: manager.into(),
        args: args.iter().map(|arg| (*arg).to_owned()).collect(),
        env: Vec::new(),
        cwd: workspace.to_owned(),
    }
}

/// PHP projects keep their dependencies in `vendor/`.
pub(crate) fn composer_install(app: &Path) -> Option<ProcessSpec> {
    if app.join("vendor/autoload.php").is_file() || !app.join("composer.json").is_file() {
        return None;
    }
    Some(ProcessSpec {
        label: "Install".into(),
        program: "composer".into(),
        args: [
            "install",
            "--no-interaction",
            "--no-progress",
            "--prefer-dist",
        ]
        .map(String::from)
        .to_vec(),
        env: Vec::new(),
        cwd: app.to_owned(),
    })
}

#[cfg(test)]
mod tests {
    use std::fs;

    use tempfile::tempdir;

    use super::*;

    #[test]
    fn a_monorepo_lockfile_decides_the_manager_and_where_install_runs() {
        let dir = tempdir().unwrap();
        let app = dir.path().join("apps/web");
        fs::create_dir_all(&app).unwrap();
        fs::write(dir.path().join("pnpm-lock.yaml"), "").unwrap();
        let (manager, workspace) = resolve_manager(&app, dir.path(), None);
        assert_eq!(manager, "pnpm");
        assert_eq!(workspace, dir.path());
    }

    #[test]
    fn without_a_lockfile_the_declared_manager_is_used() {
        let dir = tempdir().unwrap();
        let (manager, workspace) = resolve_manager(dir.path(), dir.path(), Some("pnpm@9.1.0"));
        assert_eq!((manager, workspace.as_path()), ("pnpm", dir.path()));
        assert_eq!(resolve_manager(dir.path(), dir.path(), None).0, "npm");
    }

    #[test]
    fn hoisted_dependencies_count_as_installed() {
        let dir = tempdir().unwrap();
        let app = dir.path().join("packages/app");
        fs::create_dir_all(&app).unwrap();
        assert!(missing_node_modules(&app, dir.path(), "vite", true));
        assert!(!missing_node_modules(&app, dir.path(), "vite", false));
        fs::create_dir_all(dir.path().join("node_modules/.bin")).unwrap();
        fs::write(dir.path().join("node_modules/.bin/vite"), "").unwrap();
        assert!(!missing_node_modules(&app, dir.path(), "vite", true));
    }
}
