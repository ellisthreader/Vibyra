//! The cross-platform check clippy cannot make.
//!
//! `process_kill` is the one file in Agent Mode with two whole
//! implementations, and only one of them is ever compiled here. A `use` that
//! serves the Windows branch reads as an unused import to clippy on Linux —
//! and removing it, as clippy asks, breaks the Windows build with an error
//! nobody sees until CI. That happened once, on 0.3.5's first packaging run.
//!
//! This does not compile the other branch (nothing local can). It asserts the
//! shape that made the mistake possible: platform-only imports live inside the
//! function that needs them, never at module scope.

/// Every `use` at module scope must be one both platforms compile.
#[test]
fn platform_only_imports_stay_inside_their_function() {
    let source = include_str!("process_kill.rs");
    let module_level: Vec<&str> = source
        .lines()
        .take_while(|line| !line.starts_with("#[cfg("))
        .filter(|line| line.starts_with("use "))
        .collect();

    assert_eq!(
        module_level,
        vec!["use std::process::Command;"],
        "a module-scope `use` here is compiled on both platforms and used by \
         only one of them. Put it inside the function that needs it — clippy \
         on Linux cannot see the Windows branch, and will tell you to delete \
         an import Windows requires."
    );
}

/// And the Windows branch still uses what it needs, so a future tidy-up that
/// drops the inner `use` fails here rather than in CI.
#[test]
fn the_windows_branch_imports_what_it_uses() {
    let source = include_str!("process_kill.rs");
    let windows = source
        .split("#[cfg(not(unix))]")
        .nth(2)
        .expect("the Windows terminate_group is the second not(unix) branch");
    assert!(
        windows.contains("Stdio::null()"),
        "the Windows kill should stay silent rather than print to the app's stdout"
    );
    assert!(
        windows.contains("use std::process::Stdio;"),
        "Stdio is used here and must be imported here, not at module scope"
    );
}
