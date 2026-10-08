//! Validation, the launcher warning and the file store.

use super::tests_support::spec;
use super::*;

fn base() -> ServerSpec {
    spec("spec", "")
}

#[test]
fn bad_definitions_are_refused_with_a_reason() {
    let mut s = base();
    s.command = "  ".into();
    assert!(s.validate().is_err());
    let mut s = base();
    s.cwd = Some("relative/folder".into());
    assert!(s.validate().is_err());
    let mut s = base();
    s.timeout_secs = Some(900);
    assert!(s.validate().is_err());
    let mut s = base();
    s.env.insert("1BAD".into(), "x".into());
    assert!(s.validate().is_err());
    let mut s = base();
    s.secret_env.push("FIXTURE".into()); // listed in env too
    assert!(s.validate().is_err());
    assert!(base().validate().is_ok());
}

#[test]
fn loader_and_app_variables_cannot_be_set() {
    for name in [
        "LD_PRELOAD",
        "DYLD_INSERT_LIBRARIES",
        "VIBYRA_RUNNER_KEY",
        "CLAUDE_CODE_OAUTH_TOKEN",
        "CLAUDECODE",
    ] {
        let mut s = base();
        s.env.insert(name.into(), "x".into());
        assert!(s.validate().is_err(), "{name}");
    }
    let mut s = base();
    s.env.insert("GITHUB_TOKEN".into(), "x".into()); // the person's own choice
    assert!(s.validate().is_ok());
}

fn launcher(command: &str, args: &[&str]) -> bool {
    ServerSpec {
        command: command.into(),
        args: args.iter().map(|a| a.to_string()).collect(),
        ..base()
    }
    .unpinned_launcher()
}

#[test]
fn launchers_that_fetch_code_unpinned_are_flagged() {
    assert!(launcher(
        "npx",
        &["-y", "@modelcontextprotocol/server-memory"]
    ));
    assert!(launcher("uvx", &["mcp-server-git"]));
    assert!(launcher("/opt/homebrew/bin/npx", &["pkg@latest"]));
    assert!(!launcher(
        "npx",
        &["-y", "@modelcontextprotocol/server-memory@2026.8.31"]
    ));
    assert!(!launcher(
        "uvx",
        &["mcp-server-git==2026.8.18", "--repository", "/x"]
    ));
    // The pinned SQLite preset carries `--with "mcp<2"`: that value is not the package.
    assert!(!launcher(
        "uvx",
        &[
            "--with",
            "mcp<2",
            "mcp-server-sqlite==2025.4.25",
            "--db-path",
            "/x.db"
        ]
    ));
    assert!(launcher(
        "uvx",
        &["--with", "mcp<2", "mcp-server-sqlite", "--db-path", "/x.db"]
    ));
    assert!(!launcher(
        "uvx",
        &["--from", "mcp-server-git==2026.8.18", "mcp-server-git"]
    ));
    assert!(!launcher("node", &["server.js"]));
    assert!(!launcher("/usr/local/bin/my-server", &[]));
}

#[test]
fn at_most_ten_servers_and_one_bad_entry_does_not_hide_the_rest() {
    let dir = tempfile::tempdir().unwrap();
    for n in 0..MAX_SERVERS {
        store::upsert(dir.path(), spec(&format!("s{n}"), "")).unwrap();
    }
    let eleventh = store::upsert(dir.path(), spec("extra", "")).unwrap_err();
    assert!(eleventh.to_string().contains("At most 10"));
    assert_eq!(
        store::upsert(dir.path(), spec("s0", "")).unwrap().len(),
        10,
        "editing is not adding"
    );
    std::fs::write(
        store::path_in(dir.path()),
        r#"[{"id":"x"},{"id":"good-id-123","name":"A","command":"npx"}]"#,
    )
    .unwrap();
    let loaded = store::load(dir.path());
    assert_eq!(loaded.len(), 1);
    assert_eq!(loaded[0].name, "A");
    assert_eq!(store::remove(dir.path(), "good-id-123").unwrap().len(), 0);
}

#[test]
fn the_parent_environment_is_filtered_by_name() {
    let parent = std::collections::BTreeMap::from([
        ("PATH".to_owned(), "/usr/bin".to_owned()),
        ("OPENAI_API_KEY".to_owned(), "sk".to_owned()),
    ]);
    let mut s = base();
    s.env.insert("PATH".into(), "/custom".into());
    let env = env::build(&s, &parent, &Default::default());
    assert!(
        env.contains(&("PATH".into(), "/custom".into())),
        "the person's own value wins"
    );
    assert!(!env.iter().any(|(k, _)| k == "OPENAI_API_KEY"));
}
