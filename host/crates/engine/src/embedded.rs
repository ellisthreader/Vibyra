use crate::{projects, Engine};
use serde_json::{json, Value};
use std::path::PathBuf;

#[derive(Clone)]
pub(crate) struct ConversationLaunch {
    pub provider: String,
    pub program: PathBuf,
    pub environment: Vec<(String, String)>,
    /// Runs as one chosen login (a Desktop project's account) rather than as
    /// the computer user, whose own sign-ins serve every installed CLI.
    pub account: bool,
}
impl Default for ConversationLaunch {
    fn default() -> Self {
        Self {
            provider: "codex".into(),
            program: "codex".into(),
            environment: vec![],
            account: false,
        }
    }
}
/// The CLIs a standalone Host can run as a conversation, under the computer
/// user's own sign-in for each.
const STANDALONE_PROVIDERS: [&str; 3] = ["codex", "claude", "gemini"];
impl ConversationLaunch {
    /// Which providers a `session.create` may name for a conversation here.
    pub fn providers(&self) -> Vec<&str> {
        if self.account {
            vec![self.provider.as_str()]
        } else {
            STANDALONE_PROVIDERS.to_vec()
        }
    }
    /// The launch a conversation of this kind runs with. An account-bound
    /// engine runs its one provider; a standalone Host runs the CLI that was
    /// asked for, so a phone's Claude chat is a chat and not a terminal.
    pub fn for_kind(&self, kind: &str) -> Result<Self, String> {
        if kind == self.provider {
            return Ok(self.clone());
        }
        if self.account || !STANDALONE_PROVIDERS.contains(&kind) {
            return Err("The requested provider does not match this account connection".into());
        }
        Ok(Self {
            provider: kind.into(),
            program: kind.into(),
            environment: vec![],
            account: false,
        })
    }
}

impl Engine {
    /// Local embedding only. Remote requests cannot set project identity or credentials.
    pub fn for_desktop_project(
        state_dir: PathBuf,
        id: String,
        name: String,
        root: PathBuf,
        program: PathBuf,
        environment: Vec<(String, String)>,
    ) -> Result<Self, String> {
        Self::for_desktop_provider(
            state_dir,
            id,
            name,
            root,
            "codex".into(),
            program,
            environment,
        )
    }
    #[allow(clippy::too_many_arguments)]
    pub fn for_desktop_provider(
        state_dir: PathBuf,
        id: String,
        name: String,
        root: PathBuf,
        provider: String,
        program: PathBuf,
        environment: Vec<(String, String)>,
    ) -> Result<Self, String> {
        let allowed = match provider.as_str() {
            "codex" => "CODEX_HOME",
            "claude" => "CLAUDE_CONFIG_DIR",
            "gemini" => "GEMINI_CLI_HOME",
            _ => return Err("Unsupported conversation provider".into()),
        };
        if id.is_empty() || id.len() > 128 || id.chars().any(char::is_control) {
            return Err("Invalid Desktop project identity".into());
        }
        if environment.iter().any(|(key, _)| key != allowed) {
            return Err("Only the selected provider account directory may be configured".into());
        }
        let mut configured = projects::configure(vec![(name, root)])?;
        configured[0].id = id;
        Self::from_projects(
            state_dir,
            configured,
            ConversationLaunch {
                provider,
                program,
                environment,
                account: true,
            },
        )
    }

    pub fn owns_conversation(&self, id: &str) -> bool {
        self.shared.lock().conversations.contains_key(id)
    }

    /// A deliberate local Desktop action has priority over a remote controller.
    /// Never exposed as an Engine protocol method.
    pub fn claim_locally(&self, device: &str, id: &str) -> Result<Value, String> {
        let mut state = self.shared.lock();
        let session = state.sessions.get_mut(id).ok_or("Conversation not found")?;
        if session.meta.runner.as_deref() != Some("conversation")
            || session.meta.status != "running"
        {
            return Err("Shared conversation is no longer running".into());
        }
        let token = uuid::Uuid::new_v4().to_string();
        session.lease = Some(crate::state::Lease {
            device: device.into(),
            token: token.clone(),
        });
        let result = json!({"lease":token,"generation":session.generation});
        state.emit("conversation.controlChanged", json!({"sessionId":id}));
        Ok(result)
    }

    pub fn shutdown_conversations(&self) {
        let runtimes: Vec<_> = self
            .shared
            .lock()
            .conversations
            .values()
            .filter_map(|conversation| {
                conversation
                    .runtime
                    .clone()
                    .map(|runtime| (runtime, conversation.thread_id.clone()))
            })
            .collect();
        std::thread::scope(|scope| {
            for (runtime, thread) in runtimes {
                scope.spawn(move || runtime.stop_thread(&thread));
            }
        });
    }
}

#[cfg(test)]
mod launch_tests {
    use super::ConversationLaunch;

    #[test]
    fn a_standalone_host_runs_whichever_cli_the_phone_asks_for() {
        let launch = ConversationLaunch::default();
        assert_eq!(launch.providers(), ["codex", "claude", "gemini"]);
        let claude = launch
            .for_kind("claude")
            .expect("claude runs under the user's own login");
        assert_eq!(claude.provider, "claude");
        assert_eq!(claude.program, std::path::PathBuf::from("claude"));
        assert!(claude.environment.is_empty());
        assert_eq!(launch.for_kind("codex").unwrap().provider, "codex");
        assert!(launch.for_kind("shell").is_err());
    }

    #[test]
    fn an_account_bound_engine_runs_its_one_provider() {
        let launch = ConversationLaunch {
            provider: "codex".into(),
            program: "codex".into(),
            environment: vec![("CODEX_HOME".into(), "/tmp/x".into())],
            account: true,
        };
        assert_eq!(launch.providers(), ["codex"]);
        assert!(launch.for_kind("codex").is_ok());
        assert!(launch.for_kind("claude").is_err());
    }
}
