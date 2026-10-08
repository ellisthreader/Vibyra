//! Which command the Tests section runs: the project's own test script, as
//! argv. Never a shell string, and never a script that only prints "no test
//! specified" (what `npm init` writes).

use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TestCommand {
    /// What the panel shows, e.g. `npm run test`.
    pub label: String,
    pub program: String,
    pub args: Vec<String>,
    pub cwd: PathBuf,
}

fn package_manager(root: &Path, declared: Option<&str>) -> &'static str {
    for (file, manager) in [
        ("pnpm-lock.yaml", "pnpm"),
        ("yarn.lock", "yarn"),
        ("bun.lockb", "bun"),
        ("bun.lock", "bun"),
        ("package-lock.json", "npm"),
    ] {
        if root.join(file).is_file() {
            return manager;
        }
    }
    match declared.and_then(|name| name.split('@').next()) {
        Some("pnpm") => "pnpm",
        Some("yarn") => "yarn",
        Some("bun") => "bun",
        _ => "npm",
    }
}

fn read_json(path: &Path) -> Option<serde_json::Value> {
    let bytes = std::fs::read(path)
        .ok()
        .filter(|b| b.len() <= 1024 * 1024)?;
    serde_json::from_slice(&bytes).ok()
}

fn command(root: &Path, program: &str, args: &[&str]) -> TestCommand {
    TestCommand {
        label: std::iter::once(program)
            .chain(args.iter().copied())
            .collect::<Vec<_>>()
            .join(" "),
        program: program.to_owned(),
        args: args.iter().map(|a| a.to_string()).collect(),
        cwd: root.to_owned(),
    }
}

fn placeholder(script: &str) -> bool {
    let lower = script.to_lowercase();
    lower.contains("no test specified") || lower.trim().is_empty()
}

/// `root` is the project folder. Node first (the script named `test`), then
/// Cargo, Go and Composer.
pub fn detect(root: &Path) -> Option<TestCommand> {
    if let Some(package) = read_json(&root.join("package.json")) {
        let script = package["scripts"]["test"].as_str();
        if script.is_some_and(|s| !placeholder(s)) {
            let manager = package_manager(root, package["packageManager"].as_str());
            let args: &[&str] = if manager == "yarn" {
                &["test"]
            } else {
                &["run", "test"]
            };
            return Some(command(root, manager, args));
        }
    }
    if root.join("Cargo.toml").is_file() {
        return Some(command(root, "cargo", &["test"]));
    }
    if root.join("go.mod").is_file() {
        return Some(command(root, "go", &["test", "./..."]));
    }
    let composer = read_json(&root.join("composer.json"));
    if composer.is_some_and(|c| c["scripts"]["test"].is_string() || c["scripts"]["test"].is_array())
    {
        return Some(command(root, "composer", &["run", "test"]));
    }
    None
}

#[cfg(test)]
#[path = "test_detect_tests.rs"]
mod tests;
