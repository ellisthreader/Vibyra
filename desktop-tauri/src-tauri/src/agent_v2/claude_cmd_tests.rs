use super::*;

fn input<'a>(allowed: &'a [String], config: Option<&'a Path>) -> LaunchInput<'a> {
    LaunchInput {
        program: Path::new("/opt/node/bin/claude"),
        mcp_config: Path::new("/tmp/run/ctl/mcp.json"),
        allowed_tools: allowed,
        model: "sonnet",
        effort: Some("high"),
        workdir: Path::new("/tmp/run/work"),
        home: Path::new("/Users/me"),
        user: "me",
        tmpdir: Path::new("/var/tmp"),
        config_dir: config,
    }
}

#[test]
fn the_command_line_matches_the_adapter_contract_exactly() {
    let allowed = vec![
        "mcp__vibyra-broker__gmail_search".to_owned(),
        "mcp__vibyra-broker__gmail_send".to_owned(),
    ];
    let launch = build(&input(&allowed, None));
    let expected = [
        "-p",
        "--input-format",
        "stream-json",
        "--output-format",
        "stream-json",
        "--verbose",
        "--include-partial-messages",
        "--tools",
        "",
        "--mcp-config",
        "/tmp/run/ctl/mcp.json",
        "--strict-mcp-config",
        "--setting-sources",
        "",
        "--permission-mode",
        "dontAsk",
        "--allowedTools",
        "mcp__vibyra-broker__gmail_search",
        "mcp__vibyra-broker__gmail_send",
        "--disable-slash-commands",
        "--no-chrome",
        "--no-session-persistence",
        "--model",
        "sonnet",
        "--effort",
        "high",
    ];
    assert_eq!(launch.args, expected);
    assert_eq!(launch.program, Path::new("/opt/node/bin/claude"));
    assert_eq!(launch.cwd, Path::new("/tmp/run/work"));
    for banned in [
        "--safe-mode",
        "--bare",
        "--dangerously-skip-permissions",
        "--restricted",
    ] {
        assert!(!launch.args.iter().any(|arg| arg == banned));
    }
}

#[test]
fn the_environment_is_built_from_nothing() {
    let launch = build(&input(&[], None));
    let names: Vec<_> = launch.env.iter().map(|(name, _)| name.as_str()).collect();
    assert_eq!(names, ["HOME", "USER", "LOGNAME", "TMPDIR", "LANG", "PATH"]);
    let path = &launch
        .env
        .iter()
        .find(|(name, _)| name == "PATH")
        .unwrap()
        .1;
    assert_eq!(path, "/usr/bin:/bin:/opt/node/bin");
    // No tools: no --allowedTools flag swallowing the following flags.
    assert!(!launch.args.iter().any(|arg| arg == "--allowedTools"));
}

#[test]
fn a_non_default_account_adds_only_its_config_dir() {
    let config =
        Path::new("/Users/me/Library/Application Support/vibyra-desktop/accounts/claude/a2");
    let launch = build(&input(&[], Some(config)));
    let extra: Vec<_> = launch.env.iter().skip(6).collect();
    assert_eq!(extra.len(), 1);
    assert_eq!(extra[0].0, "CLAUDE_CONFIG_DIR");
}

#[test]
fn the_spawned_command_clears_the_app_environment() {
    std::env::set_var("CLAUDE_CODE_TEST_LEAK", "1");
    let launch = build(&input(&[], None));
    let command = command(&launch);
    let envs: Vec<_> = command.get_envs().collect();
    for (name, _) in &envs {
        let name = name.to_string_lossy();
        assert!(!name.starts_with("CLAUDE_CODE_"), "{name}");
        assert!(!FORBIDDEN_ENV.contains(&name.as_ref()), "{name}");
    }
    assert_eq!(envs.len(), 6);
    // Run the same environment through `env` to observe what a child sees.
    let probe = Launch {
        program: "/usr/bin/env".into(),
        args: vec![],
        env: launch.env.clone(),
        cwd: std::env::temp_dir(),
    };
    let output = super::command(&probe).output().unwrap();
    let text = String::from_utf8_lossy(&output.stdout);
    assert!(!text.contains("CLAUDE_CODE_TEST_LEAK"));
    assert_eq!(text.lines().count(), 6);
    std::env::remove_var("CLAUDE_CODE_TEST_LEAK");
}

#[test]
fn unsupported_effort_values_are_dropped() {
    let mut value = input(&[], None);
    value.effort = Some("minimal");
    assert!(!build(&value).args.iter().any(|arg| arg == "--effort"));
}

#[test]
fn project_memory_folder_names_follow_claude_code() {
    assert_eq!(
        project_dir_name(Path::new(
            "/private/var/folders/x_1/T/vibyra-agent-Ab.c/work"
        )),
        "-private-var-folders-x-1-T-vibyra-agent-Ab-c-work"
    );
}
