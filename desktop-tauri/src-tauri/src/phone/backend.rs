use serde_json::{json, Value};
use std::{
    collections::BTreeMap,
    sync::{mpsc, Arc},
    time::Duration,
};
use vibyra_core::pty::PtyManager;
use vibyra_host::Backend;

pub struct DesktopBackend {
    manager: Arc<PtyManager>,
    generation: String,
}
impl DesktopBackend {
    pub fn new(manager: Arc<PtyManager>) -> Result<Self, String> {
        let mut bytes = [0u8; 16];
        getrandom::fill(&mut bytes).map_err(|e| e.to_string())?;
        let generation = bytes.iter().map(|b| format!("{b:02x}")).collect();
        Ok(Self {
            manager,
            generation,
        })
    }
    fn id(&self, id: u64) -> String {
        format!("{}-{id}", self.generation)
    }
    fn sessions(&self) -> Vec<Value> {
        self.manager.list().into_iter().take(128).map(|s| json!({
            "id":self.id(s.id), "projectId":"desktop", "title":s.title,
            "kind":match s.agent_id.as_str() { "codex" => "codex", "claude" => "claude", _ => "shell" },
            "status":if s.alive {"running"} else {"exited"}, "createdAt":"1970-01-01T00:00:00Z",
            "readOnly":true
        })).collect()
    }
    fn snapshot(&self, params: &Value) -> Result<Value, String> {
        let id = params["sessionId"]
            .as_str()
            .ok_or("Select a desktop terminal")?;
        let number: u64 = id
            .strip_prefix(&format!("{}-", self.generation))
            .ok_or("This desktop session expired; reconnect")?
            .parse()
            .map_err(|_| "Invalid session")?;
        let info = self
            .manager
            .list()
            .into_iter()
            .find(|s| s.id == number)
            .ok_or("Terminal closed on the Mac")?;
        let (output, offset, truncated) = self
            .manager
            .remote_snapshot(number)
            .map_err(|e| e.to_string())?;
        Ok(
            json!({"sessionId":id,"output":output,"offset":offset,"truncated":truncated,
            "generation":self.generation,"status":if info.alive {"running"} else {"exited"}}),
        )
    }
}
impl Backend for DesktopBackend {
    fn handle(&self, _: &str, method: &str, params: Value) -> Result<Value, String> {
        match method {
            "host.state" => Ok(json!({"protocol":1,"capabilities":{"readOnly":true},
                "projects":[{"id":"desktop","name":"Mac desktop terminals","path":""}],
                "sessions":self.sessions(),"sessionCount":self.manager.list().len().min(128),
                "nextCursor":null,"approvals":[],"devices":[]})),
            "session.list" => Ok(json!({"sessions":self.sessions(),"sessionCount":self.manager.list().len().min(128),"nextCursor":null})),
            "session.snapshot" => self.snapshot(&params),
            "approval.list" => Ok(json!([])),
            "session.release" => Ok(json!({"ok":true})),
            _ => Err("This desktop connection is view-only. Use Vibyra on your Mac to control terminals and files.".into()),
        }
    }
    fn subscribe(&self) -> mpsc::Receiver<Value> {
        let (send, receive) = mpsc::sync_channel(64);
        let manager = self.manager.clone();
        let generation = self.generation.clone();
        std::thread::spawn(move || {
            let mut offsets = BTreeMap::new();
            let mut previous = Vec::new();
            let mut seq = 0u64;
            loop {
                let sessions = manager.list();
                let state: Vec<_> = sessions.iter().take(128).map(|s| (s.id, s.alive)).collect();
                seq += 1;
                if state != previous
                    && send
                        .try_send(json!({"event":"host.changed","seq":seq,"data":{}}))
                        .is_err()
                {
                    break;
                }
                previous = state;
                // A heartbeat also detects disconnected receivers when every terminal is idle.
                if send
                    .try_send(json!({"event":"desktop.heartbeat","seq":seq,"data":{}}))
                    .is_err()
                {
                    break;
                }
                for session in sessions.iter().take(128) {
                    let Ok((output, offset, _)) = manager.remote_snapshot(session.id) else {
                        continue;
                    };
                    if offsets.get(&session.id) == Some(&offset) {
                        continue;
                    }
                    let old = offsets.insert(session.id, offset).unwrap_or(0);
                    let start = offset.saturating_sub(output.len() as u64);
                    seq += 1;
                    let event = if old < start {
                        json!({"event":"terminal.resync","seq":seq,"data":{"sessionId":format!("{generation}-{}",session.id),"generation":generation}})
                    } else {
                        let skip = (old.saturating_sub(start)) as usize;
                        json!({"event":"terminal.output","seq":seq,"data":{"sessionId":format!("{generation}-{}",session.id),
                            "generation":generation,"output":output.get(skip..).unwrap_or(&output),"offset":offset}})
                    };
                    if send.try_send(event).is_err() {
                        return;
                    }
                }
                offsets.retain(|id, _| sessions.iter().any(|s| s.id == *id));
                std::thread::sleep(Duration::from_millis(200));
            }
        });
        receive
    }
    fn disconnected(&self, _: &str) {}
    fn pairing_notice(&self) -> &'static str {
        "Trust lets this phone view all desktop terminal output. It cannot send commands or read files."
    }
}
