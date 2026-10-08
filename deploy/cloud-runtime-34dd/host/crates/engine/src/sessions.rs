use crate::agent_session::unavailable;
use crate::state::{Metadata, Session, State};
use crate::{agent_history, identifier, launch, now, text, Engine};
use serde_json::{json, Value};
use uuid::Uuid;

fn repeated(
    state: &State,
    device: &str,
    request: &str,
    project: &str,
    kind: &str,
    title: &str,
    resume: Option<&str>,
) -> Result<Option<Value>, String> {
    let Some(session) = state
        .sessions
        .values()
        .find(|s| s.owner == device && s.request == request)
    else {
        return Ok(None);
    };
    if session.meta.project_id != project
        || session.meta.kind != kind
        || session.meta.title != title
        || session.meta.runner.is_some()
        || resume.is_some_and(|id| session.agent_session_id.as_deref() != Some(id))
    {
        return Err("request ID was already used for a different action".into());
    }
    Ok(Some(session.summary()))
}

impl Engine {
    pub(crate) fn create(&self, device: &str, params: &Value) -> Result<Value, String> {
        let project_id = text(params, "projectId")?;
        let request = text(params, "requestId")?;
        identifier(request)?;
        let kind = text(params, "kind")?;
        let title = text(params, "title")?.trim();
        if title.is_empty() || title.len() > 160 || title.chars().any(char::is_control) {
            return Err("title must contain 1–160 bytes without control characters".into());
        }
        let resume = agent_history::resume_request(params, kind)?;
        let state = self.shared.lock();
        let project = state.resolve_project(project_id)?.clone();
        if let Some(result) = repeated(&state, device, request, &project.id, kind, title, resume)? {
            return Ok(result);
        }
        // One writer per conversation: a resume of one already running here
        // returns that session (`existing: true`) instead of a second process.
        if let Some(live) = resume.and_then(|id| crate::resume::live_writer(&state, kind, id)) {
            return Ok(live);
        }
        drop(state);
        // CLI capability probes may take seconds; never hold the output/snapshot
        // mutex while waiting for an external program.
        let canonical = std::fs::canonicalize(&project.path).map_err(|e| e.to_string())?;
        if canonical != project.path {
            return Err("project root changed; approve it locally again".into());
        }
        // Continuing an earlier conversation: it must be this project's own.
        if let Some(id) = resume {
            if !agent_history::belongs_to(kind, &self.homes, &project.path, id) {
                return Err(unavailable(
                    "That conversation is not on this computer for this project.",
                ));
            }
        }
        // Claude takes the id its conversation will be filed under, so a
        // restarted Host can reopen it; Codex's is read from the running process.
        let agent_id = match resume {
            Some(id) => Some(id.to_owned()),
            None => (kind == "claude").then(|| Uuid::new_v4().to_string()),
        };
        let start = match resume {
            Some(session_id) => launch::Start::Resume { session_id },
            None => launch::Start::Fresh {
                session_id: agent_id.as_deref(),
            },
        };
        let spec = launch::spec(kind, &canonical, start)?;
        let mut state = self.shared.lock();
        if let Some(result) = repeated(&state, device, request, &project.id, kind, title, resume)? {
            return Ok(result);
        }
        // One writer per conversation: a resume of one already running here
        // returns that session (`existing: true`) instead of a second process.
        if let Some(live) = resume.and_then(|id| crate::resume::live_writer(&state, kind, id)) {
            return Ok(live);
        }
        if state
            .sessions
            .values()
            .filter(|s| s.meta.status == "running")
            .count()
            >= 12
        {
            return Err("host has reached its 12 active session limit".into());
        }
        let metadata = Metadata {
            id: Uuid::new_v4().to_string(),
            project_id: project.id.clone(),
            title: title.into(),
            kind: kind.into(),
            status: "interrupted".into(),
            created_at: now(),
            runner: None,
        };
        let mut session = Session::restored(metadata, device.into(), request.into());
        session.agent_session_id = agent_id;
        // Commit the idempotency receipt before spawning anything. A crash after
        // this point never turns an uncertain create retry into a second process.
        state.journal.save(&session)?;
        let info = self.ptys.create_session(kind, title, &spec);
        match info {
            Ok(info) => {
                session.native_id = Some(info.id);
                session.meta.status = "running".into();
                if let Err(error) = state.journal.save(&session) {
                    let _ = self.ptys.remove(info.id);
                    session.meta.status = "interrupted".into();
                    state.sessions.insert(session.meta.id.clone(), session);
                    return Err(format!("session could not be persisted: {error}"));
                }
                state.native.insert(info.id, session.meta.id.clone());
                let result = session.summary();
                let (id, native) = (session.meta.id.clone(), info.id);
                state.sessions.insert(id.clone(), session);
                state.emit("host.changed", json!({}));
                drop(state);
                if kind == "codex" && resume.is_none() {
                    self.watch_codex_identity(id, native);
                }
                Ok(result)
            }
            Err(error) => {
                state.sessions.insert(session.meta.id.clone(), session);
                Err(format!("computer could not launch {kind}: {error}"))
            }
        }
    }

    pub(crate) fn snapshot(&self, params: &Value) -> Result<Value, String> {
        let state = self.shared.lock();
        let session = state.session(text(params, "sessionId")?)?;
        Ok(
            json!({"sessionId":session.meta.id,"output":session.output,"offset":session.offset,
            "truncated":session.offset > session.output.len() as u64,
            "status":session.meta.status,"generation":session.generation}),
        )
    }

    pub(crate) fn stop(&self, device: &str, params: &Value) -> Result<Value, String> {
        let state = self.shared.lock();
        let session = state.session(text(params, "sessionId")?)?;
        if session.owner != device
            && !session
                .lease
                .as_ref()
                .is_some_and(|lease| lease.device == device)
        {
            return Err("claim control before stopping another device's session".into());
        }
        if let Some(conversation) = state.conversations.get(&session.meta.id) {
            let runtime = conversation.runtime.clone();
            let thread = conversation.thread_id.clone();
            drop(state);
            if let Some(runtime) = runtime {
                runtime.stop_thread(&thread);
            }
            return Ok(json!({"ok":true}));
        }
        if session.meta.status == "running" {
            self.ptys
                .kill(session.native_id.ok_or("session is interrupted")?)
                .map_err(|e| e.to_string())?;
        }
        Ok(json!({"ok":true}))
    }
}
