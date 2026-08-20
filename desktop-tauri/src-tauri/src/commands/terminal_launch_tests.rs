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
    }
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
