use crate::state::{Shared, OUTPUT_LIMIT};
use serde_json::json;
use vibyra_core::pty::OutputSink;

pub(crate) struct Sink(pub Shared);

impl OutputSink for Sink {
    fn on_output(&self, id: u64, output: String) {
        let mut state = self.0.lock();
        let Some(session_id) = state.native.get(&id).cloned() else {
            return;
        };
        let mut start = 0;
        while start < output.len() {
            let mut end = (start + OUTPUT_LIMIT).min(output.len());
            while !output.is_char_boundary(end) {
                end -= 1;
            }
            let chunk = &output[start..end];
            let session = state.sessions.get_mut(&session_id).expect("mapped session");
            session.append(chunk);
            let event = json!({"sessionId":session_id,"output":chunk,
                "offset":session.offset,"generation":session.generation});
            state.emit("terminal.output", event);
            start = end;
        }
    }

    fn on_resync(&self, id: u64, output: String) {
        let mut state = self.0.lock();
        let Some(session_id) = state.native.get(&id).cloned() else {
            return;
        };
        let session = state.sessions.get_mut(&session_id).expect("mapped session");
        // A core ring overflow breaks incremental ordering: never pretend an
        // overlapping snapshot is new output. Fence stale input and resnapshot.
        session.generation = uuid::Uuid::new_v4().to_string();
        session.output.clear();
        session.offset = 0;
        session.lease = None;
        session.inputs.clear();
        session.append(&output);
        let event = json!({"sessionId":session_id,"generation":session.generation});
        state.emit("terminal.resync", event);
    }

    fn on_exit(&self, id: u64, code: Option<i32>) {
        let mut state = self.0.lock();
        let Some(session_id) = state.native.get(&id).cloned() else {
            return;
        };
        let session = state.sessions.get_mut(&session_id).expect("mapped session");
        session.meta.status = "exited".into();
        session.lease = None;
        let session = state.sessions.get(&session_id).expect("mapped session");
        if state.journal.save(session).is_err() {
            // The restore path labels any previously-running record interrupted.
            state.emit(
                "host.warning",
                json!({"message":"Session exit could not be saved"}),
            );
        }
        state.emit(
            "terminal.exit",
            json!({"sessionId":session_id,"exitCode":code}),
        );
        state.emit("host.changed", json!({}));
    }
}
