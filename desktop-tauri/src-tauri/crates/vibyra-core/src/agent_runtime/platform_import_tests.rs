//! The cross-platform check clippy cannot make.
//!
//! `npm run rust:clippy` runs on Linux, so it compiles only the `cfg(unix)`
//! branches. That makes two opposite mistakes invisible here and fatal in the
//! Windows release job, four minutes into a twenty-minute run — both were hit
//! while cutting 0.3.5:
//!
//! * A module-scope `use` that only the **Windows** branch needs reads as an
//!   unused import to clippy. Deleting it, as clippy asks, breaks Windows with
//!   `E0433`. (`Stdio` in `process_kill.rs`.)
//! * A module-scope `use` that only the **unix** branch needs compiles
//!   silently here and *is* an unused import on Windows, where `-D warnings`
//!   turns it into an error. (`TurnExit` in `process_tests.rs`.)
//!
//! Both have the same shape: an import at module scope used by cfg-gated code
//! only. This walks every file in `agent_runtime` and refuses it.
//!
//! Nothing here can compile the other platform — a real cross-build needs
//! MSVC's `lib.exe` for bundled SQLite. What this enforces is the discipline
//! that makes the other platform's compilation predictable: a platform-only
//! import belongs inside the item that needs it, or beside it under the same
//! `cfg`. The reading itself is in `platform_import_scan`.

use super::platform_import_scan::{module_scope_imports, used_by_one_platform_only};

/// Every source file in this module, as (name, contents).
const FILES: &[(&str, &str)] = &[
    ("adapter.rs", include_str!("adapter.rs")),
    ("capabilities.rs", include_str!("capabilities.rs")),
    ("claude.rs", include_str!("claude.rs")),
    ("claude_events.rs", include_str!("claude_events.rs")),
    ("codex.rs", include_str!("codex.rs")),
    ("codex_events.rs", include_str!("codex_events.rs")),
    ("events.rs", include_str!("events.rs")),
    ("process.rs", include_str!("process.rs")),
    ("process_io.rs", include_str!("process_io.rs")),
    ("process_kill.rs", include_str!("process_kill.rs")),
    ("process_tests.rs", include_str!("process_tests.rs")),
];

#[test]
fn no_module_scope_import_is_used_only_by_one_platform() {
    let mut offences = Vec::new();
    for (name, source) in FILES {
        for imported in module_scope_imports(source) {
            if let Some(side) = used_by_one_platform_only(source, &imported) {
                offences.push(format!(
                    "{name}: `{imported}` is imported at module scope but used only by \
                     {side} code. Move it inside the item that needs it — the other platform \
                     either cannot see it (E0433) or rejects it as unused."
                ));
            }
        }
    }
    assert!(offences.is_empty(), "\n{}", offences.join("\n"));
}

/// The analysis has to find the two mistakes it was written for, and none of
/// the three shapes that are fine — otherwise it is a test that passes because
/// it is looking at nothing.
#[test]
fn the_check_recognises_both_mistakes_and_no_innocent_ones() {
    let windows_only = "use std::process::Command;\nuse std::process::Stdio;\n\n\
         #[cfg(not(unix))]\nfn kill() {\n    Command::new(\"taskkill\").stdout(Stdio::null());\n}\n";
    let unix_only = "use super::process::{run, TurnExit};\n\n\
         #[cfg(unix)]\nfn works() {\n    assert_eq!(run(), TurnExit::Completed);\n}\n";

    assert_eq!(
        used_by_one_platform_only(windows_only, "Stdio"),
        Some("non-unix-only"),
        "the import whose deletion broke the Windows build was not flagged"
    );
    assert_eq!(
        used_by_one_platform_only(unix_only, "TurnExit"),
        Some("unix-only"),
        "the import that is unused on Windows was not flagged"
    );

    let both = "use std::process::Command;\n\n\
        #[cfg(unix)]\nfn a() {\n    Command::new(\"x\");\n}\n\n\
        #[cfg(not(unix))]\nfn b() {\n    Command::new(\"y\");\n}\n";
    let plain = "use std::process::Command;\n\nfn spawn() {\n    Command::new(\"x\");\n}\n";
    let trait_only = "use std::io::Write;\n\nfn put(f: &mut File) {\n    f.write_all(b\"x\");\n}\n";

    assert_eq!(
        used_by_one_platform_only(both, "Command"),
        None,
        "both branches use it"
    );
    assert_eq!(
        used_by_one_platform_only(plain, "Command"),
        None,
        "an ungated use"
    );
    assert_eq!(
        used_by_one_platform_only(trait_only, "Write"),
        None,
        "a trait's methods"
    );
}
