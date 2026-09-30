use super::*;

#[test]
fn the_cache_answers_from_its_window_and_rebuilds_after_it() {
    let temp = tempfile::tempdir().unwrap();
    let first = build_cached("Studio", temp.path(), Vec::new(), None);
    assert_eq!(first.shape, brief::Shape::Plain);

    std::fs::write(
        temp.path().join("package.json"),
        r#"{"scripts":{"dev":"x"}}"#,
    )
    .unwrap();
    let hit = build_cached("Studio", temp.path(), Vec::new(), None);
    assert_eq!(hit.text, first.text, "a hit must not rebuild");

    std::thread::sleep(LIVE_TTL + Duration::from_millis(60));
    let rebuilt = build_cached("Studio", temp.path(), Vec::new(), None);
    assert_eq!(rebuilt.shape, brief::Shape::Folder);
    assert!(rebuilt.text.contains("dev"), "{}", rebuilt.text);
}

#[test]
fn a_terminal_outside_the_project_is_not_listed() {
    let temp = tempfile::tempdir().unwrap();
    let inside = temp.path().join("app");
    std::fs::create_dir(&inside).unwrap();
    let sessions = vec![
        session(
            1,
            "Terminal 1",
            "shell",
            temp.path().to_str().unwrap(),
            true,
        ),
        session(2, "Claude", "claude", inside.to_str().unwrap(), false),
        session(3, "Elsewhere", "shell", "/", true),
    ];
    let lines = terminal_lines(&sessions, temp.path());
    assert_eq!(
        lines,
        vec![
            "Terminal 1 — shell in .".to_string(),
            "Claude — claude in app (exited)".to_string(),
        ]
    );
}

fn session(id: u64, title: &str, agent: &str, cwd: &str, alive: bool) -> SessionInfo {
    SessionInfo {
        id,
        agent_id: agent.into(),
        title: title.into(),
        program: "/bin/zsh".into(),
        cwd: Some(cwd.into()),
        visibility: vibyra_core::pty::Visibility::Visible,
        alive,
        exit_code: None,
        cols: 80,
        rows: 24,
    }
}
