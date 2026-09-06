use crate::state::{Metadata, Session, State};
use crate::{identifier, launch, now, text, Engine};
use serde_json::{json, Value};
use uuid::Uuid;

fn repeated(
    state: &State,
    device: &str,
    request: &str,
    project: &str,
    kind: &str,
    title: &str,
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
    {
        return Err("request ID was already used for a different action".into());
    }
    Ok(Some(json!(session.meta)))
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
        let state = self.shared.lock();
        let project = state.resolve_project(project_id)?.clone();
        if let Some(result) = repeated(&state, device, request, &project.id, kind, title)? {
            return Ok(result);
        }
        drop(state);
        // CLI capability probes may take seconds; never hold the output/snapshot
        // mutex while waiting for an external program.
        let canonical = std::fs::canonicalize(&project.path).map_err(|e| e.to_string())?;
        if canonical != project.path {
            return Err("project root changed; approve it locally again".into());
        }
        let spec = launch::spec(kind, &canonical)?;
        let mut state = self.shared.lock();
        if let Some(result) = repeated(&state, device, request, &project.id, kind, title)? {
            return Ok(result);
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
        };
        let mut session = Session::restored(metadata, device.into(), request.into());
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
                let result = json!(session.meta);
                state.sessions.insert(session.meta.id.clone(), session);
                state.emit("host.changed", json!({}));
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
        if session.meta.status == "running" {
            self.ptys
                .kill(session.native_id.ok_or("session is interrupted")?)
                .map_err(|e| e.to_string())?;
        }
        Ok(json!({"ok":true}))
    }
}
