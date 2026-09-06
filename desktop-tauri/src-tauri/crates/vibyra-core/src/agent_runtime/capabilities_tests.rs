use super::*;

/// The two version strings this code actually meets, both parsed from the
/// real CLIs on 2026-08-29.
#[test]
fn reads_both_providers_version_shapes() {
    assert_eq!(parse_version("2.1.251 (Claude Code)"), Some((2, 1, 251)));
    assert_eq!(parse_version("codex-cli 0.150.1"), Some((0, 150, 1)));
    assert_eq!(parse_version("no numbers here"), None);
}

#[test]
fn a_recent_claude_with_the_right_flags_is_usable() {
    let help = "--session-id <uuid> --resume [value] --output-format stream-json \
                    --permission-mode <mode> --model <model> --effort <level> --settings --setting-sources --strict-mcp-config --tools --input-format";
    let found = interpret(Engine::Claude, "2.1.261 (Claude Code)", help);
    assert!(found.structured, "{}", found.blocker);
    assert!(found.supports_model && found.supports_effort);
}

/// An old CLI loses structured chat and keeps its terminal, and the
/// message says which.
#[test]
fn an_old_cli_is_refused_with_something_to_do_about_it() {
    let found = interpret(Engine::Codex, "codex-cli 0.90.0", "--json resume");
    assert!(!found.structured);
    assert!(
        found.blocker.contains("terminals still work"),
        "{}",
        found.blocker
    );
}

/// Present, recent, but missing a flag the adapter depends on: still
/// refused, and the message names the flag rather than guessing.
#[test]
fn a_missing_flag_is_named() {
    let found = interpret(
        Engine::Claude,
        "2.1.261",
        "--resume stream-json --permission-mode",
    );
    assert!(!found.structured);
    assert!(found.blocker.contains("--session-id"), "{}", found.blocker);
}

#[test]
fn a_missing_cli_says_so_plainly() {
    let found = interpret(Engine::Codex, "", "");
    assert!(!found.installed && !found.structured);
    assert!(found.blocker.contains("not installed"));
}
