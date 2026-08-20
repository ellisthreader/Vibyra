use std::path::Path;

use super::{AgentSpec, ResolvedAgent};
use crate::pty::default_shell;

fn agent(id: &str, name: &str, program: &str, accent: &str, description: &str) -> AgentSpec {
    AgentSpec {
        id: id.into(),
        name: name.into(),
        program: program.into(),
        args: Vec::new(),
        env: Vec::new(),
        accent: accent.into(),
        description: description.into(),
        custom: false,
    }
}

/// Built-in catalog of AI CLI agents. Purely declarative — new agents are
/// one line here or a custom entry in settings, nothing else to wire up.
pub fn builtin_agents() -> Vec<AgentSpec> {
    vec![
        agent(
            "shell",
            "Terminal",
            &default_shell(),
            "#7dd3fc",
            "Plain system shell",
        ),
        agent(
            "claude",
            "Claude Code",
            "claude",
            "#d97757",
            "Anthropic Claude Code CLI",
        ),
        agent("codex", "Codex", "codex", "#a5b4fc", "OpenAI Codex CLI"),
        agent("gemini", "Gemini", "gemini", "#60a5fa", "Google Gemini CLI"),
        agent(
            "aider",
            "Aider",
            "aider",
            "#4ade80",
            "Aider pair-programming CLI",
        ),
        agent(
            "opencode",
            "OpenCode",
            "opencode",
            "#f472b6",
            "OpenCode agent CLI",
        ),
        agent("qwen", "Qwen Code", "qwen", "#c084fc", "Qwen Code CLI"),
    ]
}

/// Merges built-ins with user-defined agents (custom entries with the same
/// id override the built-in) and checks executable availability.
pub fn resolve_agents(custom: &[AgentSpec]) -> Vec<ResolvedAgent> {
    let mut agents = builtin_agents();
    for user_agent in custom {
        let mut user_agent = user_agent.clone();
        user_agent.custom = true;
        if let Some(existing) = agents.iter_mut().find(|a| a.id == user_agent.id) {
            *existing = user_agent;
        } else {
            agents.push(user_agent);
        }
    }
    agents
        .into_iter()
        .map(|spec| {
            let installed = program_in_path(&spec.program);
            ResolvedAgent { spec, installed }
        })
        .collect()
}

/// Checks whether `program` resolves to an executable, either as an
/// absolute/relative path or through PATH.
pub fn program_in_path(program: &str) -> bool {
    let path = Path::new(program);
    if path.components().count() > 1 {
        return is_executable(path);
    }
    let Some(paths) = std::env::var_os("PATH") else {
        return false;
    };
    for dir in std::env::split_paths(&paths) {
        let candidate = dir.join(program);
        if is_executable(&candidate) {
            return true;
        }
        #[cfg(windows)]
        {
            for ext in ["exe", "cmd", "bat"] {
                if is_executable(&candidate.with_extension(ext)) {
                    return true;
                }
            }
        }
    }
    false
}

#[cfg(unix)]
fn is_executable(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    path.metadata()
        .map(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[cfg(not(unix))]
fn is_executable(path: &Path) -> bool {
    path.is_file()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builtins_include_shell_and_claude() {
        let agents = builtin_agents();
        assert!(agents.iter().any(|a| a.id == "shell"));
        assert!(agents.iter().any(|a| a.id == "claude"));
    }

    #[cfg(unix)]
    #[test]
    fn finds_sh_in_path() {
        assert!(program_in_path("sh"));
        assert!(program_in_path("/bin/sh"));
        assert!(!program_in_path("definitely-not-a-real-binary-xyz"));
    }

    #[test]
    fn custom_agent_overrides_builtin_and_appends_new() {
        let custom = vec![
            AgentSpec {
                id: "claude".into(),
                name: "Claude (custom)".into(),
                program: "claude-custom".into(),
                args: vec!["--flag".into()],
                env: vec![],
                accent: "#fff".into(),
                description: String::new(),
                custom: false,
            },
            AgentSpec {
                id: "my-agent".into(),
                name: "Mine".into(),
                program: "sh".into(),
                args: vec![],
                env: vec![],
                accent: String::new(),
                description: String::new(),
                custom: false,
            },
        ];
        let resolved = resolve_agents(&custom);
        let claude = resolved.iter().find(|a| a.spec.id == "claude").unwrap();
        assert_eq!(claude.spec.name, "Claude (custom)");
        assert!(claude.spec.custom);
        assert!(resolved.iter().any(|a| a.spec.id == "my-agent"));
    }
}
