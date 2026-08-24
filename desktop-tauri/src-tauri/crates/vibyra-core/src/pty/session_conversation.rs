use super::super::{chat_prompt, conversation};
use super::Session;

// Which provider conversation a live PTY owns, discovered from the process
// tree rather than by asking the provider to announce one. Split from the
// session's own file because it is archaeology, not PTY plumbing — and because
// that file is at the 200-line limit.

impl Session {
    pub fn agent_session_id(&self) -> Option<String> {
        conversation::codex_session_id(self.codex_process_id()?)
    }

    /// The opening prompt of this pane's conversation, read from the
    /// provider's own transcript rather than inferred from keystrokes.
    pub fn agent_chat_prompt(&self) -> Option<String> {
        let rollout = conversation::codex_rollout_path(self.codex_process_id()?)?;
        chat_prompt::first_prompt(&rollout)
    }

    /// Codex is the only agent whose conversation is discoverable this way.
    fn codex_process_id(&self) -> Option<u32> {
        (self.agent_id == "codex").then(|| self.child.lock().process_id())?
    }
}
