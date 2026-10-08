//! `session.resume`: reopen an interrupted Claude or Codex terminal in its own
//! session record, with the agent's own `--resume` / `resume <id>`.
use crate::agent_session::{transcript_exists, unavailable, valid_id};
use crate::state::{Project, State};
use crate::{launch, text, Engine};
use serde_json::{json, Value};

const SESSION_LIMIT: usize = 12;

/// Everything that must hold for a session to be reopened, read from the
/// engine's state and the disk: `(provider, agent session id, project)`.
fn check(
    state: &State,
    homes: &crate::agent_session::Homes,
    id: &str,
) -> Result<(String, String, Project), String> {
    let session = state.session(id)?;
    if session.meta.runner.is_some() || state.conversations.contains_key(id) {
        return Err(unavailable("Only terminal sessions can be resumed."));
    }
    match session.meta.status.as_str() {
        "interrupted" => {}
        "running" => return Err("This session is already running.".into()),
        _ => return Err(unavailable("This session has ended; start a new one.")),
    }
    let kind = session.meta.kind.as_str();
    if !matches!(kind, "claude" | "codex") {
        return Err(unavailable("This kind of terminal cannot be resumed."));
    }
    let agent = session
        .agent_session_id
        .as_deref()
        .filter(|agent| valid_id(agent))
        .ok_or_else(|| unavailable("This session did not record a conversation to resume."))?;
    if !transcript_exists(kind, homes, agent) {
        return Err(unavailable(
            "This conversation's history is no longer on this computer.",
        ));
    }
    let project = state
        .resolve_project(&session.meta.project_id)
        .map_err(|_| unavailable("This session's project is no longer shared."))?
        .clone();
    Ok((kind.to_owned(), agent.to_owned(), project))
}

/// `session.create {resume}` for a conversation already running here: that
/// session, marked `existing`, instead of a second writer on one transcript.
pub(crate) fn live_writer(state: &State, kind: &str, agent: &str) -> Option<Value> {
    let session = state.sessions.values().find(|s| {
        s.meta.status == "running"
            && s.meta.kind == kind
            && s.agent_session_id.as_deref() == Some(agent)
    })?;
    let mut value = session.summary();
    value["sessionId"] = json!(session.meta.id);
    value["existing"] = json!(true);
    Some(value)
}

impl Engine {
    pub(crate) fn resume(&self, params: &Value) -> Result<Value, String> {
        let id = text(params, "sessionId")?;
        let (kind, agent, project) = check(&self.shared.lock(), &self.homes, id)?;
        // The Claude capability probe may take seconds; never hold the lock.
        let canonical = std::fs::canonicalize(&project.path)
            .map_err(|_| unavailable("This session's project folder is gone."))?;
        if canonical != project.path {
            return Err("project root changed; approve it locally again".into());
        }
        let spec = launch::spec(
            &kind,
            &canonical,
            launch::Start::Resume { session_id: &agent },
        )?;
        let mut state = self.shared.lock();
        // Another request may have reopened it while the probe ran.
        check(&state, &self.homes, id)?;
        let running = state
            .sessions
            .values()
            .filter(|s| s.meta.status == "running");
        if running.count() >= SESSION_LIMIT {
            return Err(format!(
                "host has reached its {SESSION_LIMIT} active session limit"
            ));
        }
        let title = state.session(id)?.meta.title.clone();
        let info = self
            .ptys
            .create_session(&kind, &title, &spec)
            .map_err(|error| format!("computer could not resume {kind}: {error}"))?;
        let session = state.sessions.get_mut(id).expect("checked above");
        session.native_id = Some(info.id);
        session.meta.status = "running".into();
        session.generation = uuid::Uuid::new_v4().to_string();
        session.output.clear();
        session.offset = 0;
        session.lease = None;
        session.inputs.clear();
        session.can_resume = false;
        session.touch();
        if let Err(error) = state.journal.save(&state.sessions[id]) {
            let _ = self.ptys.remove(info.id);
            let session = state.sessions.get_mut(id).expect("checked above");
            session.native_id = None;
            session.meta.status = "interrupted".into();
            session.can_resume = true;
            return Err(format!("session could not be persisted: {error}"));
        }
        state.native.insert(info.id, id.to_owned());
        let result = state.sessions[id].summary();
        state.emit("host.changed", json!({}));
        Ok(result)
    }

    /// Decides `canResume` for every interrupted terminal. Run once when the
    /// Host starts: a session only becomes interrupted by a restart.
    pub(crate) fn refresh_resumable(&self) {
        let mut state = self.shared.lock();
        for session in state.sessions.values_mut() {
            let kind = session.meta.kind.as_str();
            session.can_resume = session.meta.status == "interrupted"
                && session.meta.runner.is_none()
                && session.agent_session_id.as_deref().is_some_and(|agent| {
                    matches!(kind, "claude" | "codex")
                        && transcript_exists(kind, &self.homes, agent)
                });
        }
    }
}

#[cfg(test)]
#[path = "live_writer_tests.rs"]
mod live_writer_tests;
