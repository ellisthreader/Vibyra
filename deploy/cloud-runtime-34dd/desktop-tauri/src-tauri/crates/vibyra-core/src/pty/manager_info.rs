use super::*;

pub(super) fn describe(session: &Session) -> SessionInfo {
    SessionInfo {
        id: session.id,
        agent_id: session.agent_id.clone(),
        title: session.title.lock().clone(),
        program: session.program.clone(),
        cwd: session.cwd.clone(),
        visibility: session.output.lock().visibility,
        alive: session.is_alive(),
        exit_code: *session.exit_code.lock(),
        cols: session.size().0,
        rows: session.size().1,
    }
}
