use vibyra_core::pty::LaunchSpec;

use super::terminal_launch::{
    configure_launch, isolate_account_environment, validate_ssh_target, CreateTerminalRequest,
    PermissionMode,
};

fn request(agent_id: &str) -> CreateTerminalRequest {
    CreateTerminalRequest {
        agent_id: agent_id.into(),
        cwd: None,
        rows: None,
        cols: None,
        model: None,
        permission_mode: None,
        reasoning_effort: None,
        workspace_mode: None,
        safe_snapshot_fingerprint: None,
        resume: None,
        agent_session_id: None,
        account_id: None,
    }
}

const SESSION: &str = "3f9a1c2e-5b7d-4e81-9a3f-2c6d8e0b4a17";

#[test]
fn a_new_claude_pane_is_given_its_own_conversation() {
    // Without this every pane in a folder resumes the same conversation.
    let mut request = request("claude");
    request.agent_session_id = Some(SESSION.into());
    let mut spec = LaunchSpec::shell(None, None);
    configure_launch(&mut spec, &request).unwrap();
    assert_eq!(spec.args, ["--session-id", SESSION]);
}

#[test]
fn resume_names_the_panes_own_conversation_when_it_has_one() {
    let mut request = request("claude");
    request.resume = Some(true);
    request.agent_session_id = Some(SESSION.into());
    let mut spec = LaunchSpec::shell(None, None);
    configure_launch(&mut spec, &request).unwrap();
    assert_eq!(spec.args, ["--resume", SESSION]);
}

#[test]
fn agents_that_cannot_be_told_an_id_are_never_pinned() {
    // Codex takes no id at launch, and Gemini takes one but cannot resume by
    // it — passing one would be a flag they reject or silently ignore.
    for agent in ["codex", "gemini", "shell", "aider"] {
        let mut request = request(agent);
        request.agent_session_id = Some(SESSION.into());
        let mut spec = LaunchSpec::shell(None, None);
        configure_launch(&mut spec, &request).unwrap();
        assert!(spec.args.is_empty(), "{agent}");
    }
}

#[test]
fn a_session_id_that_is_not_a_uuid_never_reaches_a_command_line() {
    for hostile in [
        "--dangerously-skip-permissions",
        "3f9a1c2e-5b7d-4e81-9a3f-2c6d8e0b4a1",
        "3f9a1c2e5b7d4e819a3f2c6d8e0b4a17",
        "3f9a1c2e-5b7d-4e81-9a3f-2c6d8e0b4a1z",
        "",
    ] {
        let mut request = request("claude");
        request.agent_session_id = Some(hostile.into());
        let mut spec = LaunchSpec::shell(None, None);
        assert!(configure_launch(&mut spec, &request).is_err(), "{hostile}");
    }
}

#[test]
fn resume_asks_each_agent_to_continue_its_own_conversation() {
    for (agent, expected) in [
        ("claude", vec!["--continue"]), // no id: fall back to recency
        ("codex", vec!["resume", "--last"]),
        ("gemini", vec!["--resume", "latest"]),
    ] {
        let mut request = request(agent);
        request.resume = Some(true);
        let mut spec = LaunchSpec::shell(None, None);
        configure_launch(&mut spec, &request).unwrap();
        assert_eq!(spec.args, expected, "{agent}");
    }
}

#[test]
fn the_resume_verb_leads_so_codex_parses_its_subcommand_options() {
    // `codex resume` is a subcommand: --model and the sandbox flag are only
    // accepted after it. Anything that puts them first breaks resume.
    let mut request = request("codex");
    request.resume = Some(true);
    request.model = Some("gpt-5.6-sol".into());
    request.permission_mode = Some(PermissionMode::Full);
    let mut spec = LaunchSpec::shell(None, None);
    configure_launch(&mut spec, &request).unwrap();
    assert_eq!(
        spec.args,
        [
            "resume",
            "--last",
            "--model",
            "gpt-5.6-sol",
            "--dangerously-bypass-approvals-and-sandbox"
        ]
    );
}

#[test]
fn resuming_an_agent_with_no_conversation_relaunches_rather_than_failing() {
    // A plain shell, an SSH pane or a custom CLI has nothing to continue.
    // Refusing here would make its Resume button dead.
    for agent in ["shell", "ssh", "aider", "my-custom-agent"] {
        let mut request = request(agent);
        request.resume = Some(true);
        let mut spec = LaunchSpec::shell(None, None);
        configure_launch(&mut spec, &request).unwrap();
        assert!(spec.args.is_empty(), "{agent}");
    }
}

#[test]
fn a_restart_is_not_a_resume() {
    let mut request = request("claude");
    request.resume = Some(false);
    let mut spec = LaunchSpec::shell(None, None);
    configure_launch(&mut spec, &request).unwrap();
    assert!(spec.args.is_empty());
}

#[test]
fn rejects_renderer_argument_injection() {
    let mut request = request("codex");
    request.model = Some("--dangerously-bypass-approvals-and-sandbox".into());
    let mut spec = LaunchSpec::shell(None, None);
    assert!(configure_launch(&mut spec, &request).is_err());
    assert!(validate_ssh_target("-oProxyCommand=evil").is_err());
    assert!(validate_ssh_target("host\ncommand").is_err());
}

#[test]
fn builds_only_known_privileged_arguments() {
    let mut request = request("codex");
    request.model = Some("gpt-5.6-sol".into());
    request.permission_mode = Some(PermissionMode::Full);
    request.reasoning_effort = Some("ultra".into());
    let mut spec = LaunchSpec::shell(None, None);
    configure_launch(&mut spec, &request).unwrap();
    assert_eq!(
        spec.args,
        [
            "--model",
            "gpt-5.6-sol",
            "--dangerously-bypass-approvals-and-sandbox",
            "-c",
            "model_reasoning_effort=\"ultra\""
        ]
    );
}

#[test]
fn rejects_out_of_range_terminal_sizes() {
    let mut request = request("shell");
    request.rows = Some(1);
    assert!(configure_launch(&mut LaunchSpec::shell(None, None), &request).is_err());
}

#[test]
fn isolates_only_builtin_personal_account_runtimes() {
    let mut builtin = LaunchSpec::shell(None, None);
    isolate_account_environment(&mut builtin, "codex", false, vec!["OPENAI_API_KEY".into()]);
    assert_eq!(builtin.env_remove, ["OPENAI_API_KEY"]);

    let mut custom = LaunchSpec::shell(None, None);
    isolate_account_environment(&mut custom, "codex", true, vec!["OPENAI_API_KEY".into()]);
    assert!(custom.env_remove.is_empty());

    let mut shell = LaunchSpec::shell(None, None);
    isolate_account_environment(&mut shell, "shell", false, vec!["OPENAI_API_KEY".into()]);
    assert!(shell.env_remove.is_empty());
}
