use super::runtime::Runtime;
use serde_json::Value;
use std::{
    path::Path,
    process::{Command, Stdio},
    sync::Arc,
};

const BRIDGE: &str = concat!(
    include_str!("../../../../provider-bridge/wire.cjs"),
    "\n",
    include_str!("../../../../provider-bridge/claude.cjs"),
    "\n",
    include_str!("../../../../provider-bridge/gemini.cjs"),
    "\n",
    include_str!("../../../../provider-bridge/main.cjs")
);

pub(super) fn spawn(
    root: &Path,
    kind: &str,
    launch: &crate::embedded::ConversationLaunch,
    event: impl Fn(Value) + Send + 'static,
) -> Result<Arc<Runtime>, String> {
    let mut command = Command::new("node");
    command
        .args(["-e", BRIDGE, kind])
        .arg(&launch.program)
        .current_dir(root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    for key in [
        "OPENAI_API_KEY",
        "CODEX_API_KEY",
        "OPENROUTER_API_KEY",
        "ANTHROPIC_API_KEY",
        "CLAUDE_CODE_OAUTH_TOKEN",
        "CLAUDECODE",
        "GEMINI_API_KEY",
        "GOOGLE_API_KEY",
        "GOOGLE_APPLICATION_CREDENTIALS",
    ] {
        command.env_remove(key);
    }
    command.envs(launch.environment.iter().cloned());
    Runtime::spawn_command(command, event)
}
