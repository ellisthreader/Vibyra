//! Which package scripts start a desktop app, and which are safe to offer.

use super::package_profile::has_marker;

/// Longer than a web script: desktop scripts often build a sidecar first.
const MAX_BODY: usize = 600;

/// Scripts that build, test or package rather than run the app for use.
const NOT_A_RUN: [&str; 14] = [
    "build", "test", "check", "lint", "verify", "audit", "release", "package", "dist", "bundle",
    "prod", "sidecar", "deploy", "clean",
];

/// A desktop script may chain steps with `&&` (build the assets, then run the
/// app) but nothing else a shell would interpret: no separators, pipes,
/// background jobs, substitution or redirection. The body is shown to the owner
/// before it runs, and is part of the approval's fingerprint.
pub(crate) fn desktop_script_ok(body: &str) -> bool {
    let rest = body.replace("&&", " ");
    let forbidden = ["&", "||", ";", "|", "`", "$(", "\n", "\r", ">", "<"];
    !forbidden.iter().any(|token| rest.contains(token))
        && !body.contains("||")
        && !body.trim().is_empty()
        && body.len() <= MAX_BODY
}

/// The framework a script launches as a desktop window, if it does.
pub(crate) fn classify(name: &str, body: &str) -> Option<&'static str> {
    let lower_name = name.to_ascii_lowercase();
    if lower_name
        .split([':', '-', '_'])
        .any(|part| NOT_A_RUN.contains(&part))
    {
        return None;
    }
    let body = body.to_ascii_lowercase();
    if has_marker(&body, "tauri dev") {
        Some("Tauri")
    } else if has_marker(&body, "cargo run") {
        Some("Desktop app")
    } else if ["electron .", "electron-forge start", "electron-vite dev"]
        .iter()
        .any(|marker| has_marker(&body, marker))
    {
        Some("Electron")
    } else if named(&lower_name, "tauri") {
        Some("Tauri")
    } else if named(&lower_name, "electron") {
        Some("Electron")
    } else if named(&lower_name, "desktop") {
        Some("Desktop app")
    } else {
        None
    }
}

/// `tauri`, `tauri:dev`, `dev:tauri` and the like; not `tauri:icons`.
fn named(name: &str, word: &str) -> bool {
    let parts = name.split([':', '-', '_']).collect::<Vec<_>>();
    parts.contains(&word)
        && parts
            .iter()
            .all(|part| *part == word || matches!(*part, "dev" | "start" | "run" | "app"))
}

/// Tauri first, then desktop builds, then Electron: the order a project's
/// primary app is most likely to appear in.
pub(crate) fn rank(framework: &str, name: &str) -> (u8, bool, String) {
    let order = match framework {
        "Tauri" => 0,
        "Desktop app" => 1,
        _ => 2,
    };
    (order, !name.contains("dev"), name.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_and_chains_but_no_other_shell_syntax() {
        assert!(desktop_script_ok(
            "npm run desktop:assets && cargo run --manifest-path software/desktop/Cargo.toml"
        ));
        for body in [
            "a; b", "a | b", "a || b", "a & b", "a `b`", "a $(b)", "a > f", "a < f", "a\nb", " ",
        ] {
            assert!(!desktop_script_ok(body), "{body:?} was accepted");
        }
        assert!(!desktop_script_ok(&"x".repeat(MAX_BODY + 1)));
    }

    #[test]
    fn recognises_desktop_runs_and_skips_builds_and_checks() {
        assert_eq!(
            classify("rust:dev", "npm run a && cargo run"),
            Some("Desktop app")
        );
        assert_eq!(classify("tauri", "tauri dev"), Some("Tauri"));
        assert_eq!(classify("electron", "electron ."), Some("Electron"));
        assert_eq!(
            classify("electron:dev", "node scripts/electron-dev.mjs"),
            Some("Electron")
        );
        assert_eq!(classify("rust:build", "cargo build --release"), None);
        assert_eq!(classify("rust:prod", "cargo run --release"), None);
        assert_eq!(
            classify("verify:visual", "electron scripts/visual.mjs"),
            None
        );
        assert_eq!(classify("tauri:icons", "tauri icon"), None);
        assert_eq!(classify("dev", "vite"), None);
    }
}
