//! Opt-in metadata publisher. The caller owns credentials; no transcript leaves here.
use crate::Backend;
use serde_json::{json, Value};
use std::{
    collections::BTreeMap, future::Future, path::PathBuf, pin::Pin, sync::Arc, time::Duration,
};
pub type NotificationSender = Arc<
    dyn Fn(Vec<Value>) -> Pin<Box<dyn Future<Output = Result<(), String>> + Send>> + Send + Sync,
>;
pub struct NotificationHandle(tokio::task::JoinHandle<()>);
impl Drop for NotificationHandle {
    fn drop(&mut self) {
        self.0.abort();
    }
}

pub fn metadata(event: &Value) -> Option<Value> {
    if event["event"] != "conversation.updated" {
        return None;
    }
    let d = &event["data"];
    let session = d["sessionId"].as_str()?;
    let generation = d["generation"].as_str()?;
    let turn = d["turnId"].as_str()?;
    let sequence = d["cursor"].as_u64()?;
    let phase = match d["turnState"].as_str()? {
        "completed" => "reply_ready",
        "failed" => "failed",
        "interrupted" | "cancelled" => "stopped",
        "waiting" if d["item"]["kind"] == "permission" && d["item"]["status"] == "pending" => {
            "approval_pending"
        }
        "waiting" if d["item"]["kind"] == "question" && d["item"]["status"] == "pending" => {
            "question_pending"
        }
        "running" => "working",
        // A resolved/ambiguous wait invalidates any earlier actionable observation.
        "waiting" => "unavailable",
        _ => return None,
    };
    Some(
        json!({"sessionId":session,"generation":generation,"turnId":turn,"sequence":sequence,
        "phase":phase,"occurredAt":chrono::Utc::now().to_rfc3339()}),
    )
}

impl crate::EmbeddedHost {
    pub fn notifications(&self, path: PathBuf, send: NotificationSender) -> NotificationHandle {
        let _runtime = self.runtime.enter();
        start(self.shared.engine.clone(), path, send)
    }
}
pub fn start(
    backend: Arc<dyn Backend>,
    path: PathBuf,
    send: NotificationSender,
) -> NotificationHandle {
    NotificationHandle(tokio::spawn(async move {
        let mut events = backend.subscribe_conversations();
        let mut spool: BTreeMap<String, Value> = BTreeMap::new();
        let mut phases = BTreeMap::new();
        // Whether the file may differ from `spool`. It starts out true so the
        // first pass replaces whatever an earlier run left there.
        let mut unsaved = true;
        loop {
            tokio::time::sleep(Duration::from_secs(2)).await;
            loop {
                match events.try_recv() {
                    Ok(event) => {
                        if let Some(data) = metadata(&event) {
                            let key = format!(
                                "{}:{}:{}",
                                data["sessionId"], data["generation"], data["turnId"]
                            );
                            let phase = data["phase"].as_str().unwrap_or("").to_string();
                            if phase != "working" || phases.get(&key) != Some(&phase) {
                                phases.insert(key.clone(), phase);
                                spool.insert(key, data);
                                unsaved = true;
                            }
                        }
                    }
                    Err(std::sync::mpsc::TryRecvError::Empty) => break,
                    Err(std::sync::mpsc::TryRecvError::Disconnected) => {
                        unsaved |= !spool.is_empty();
                        spool.clear();
                        phases.clear();
                        events = backend.subscribe_conversations();
                        break;
                    }
                }
            }
            let held = spool.len();
            // Old offline observations must not wake someone about work that may have finished.
            spool.retain(|_, e| {
                e["occurredAt"]
                    .as_str()
                    .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
                    .is_some_and(|at| {
                        chrono::Utc::now().signed_duration_since(at).num_seconds() < 120
                    })
            });
            while spool.len() > 200 {
                spool.pop_first();
            }
            if phases.len() > 500 {
                phases.clear();
            }
            // Only a spool that changed is written; rewriting the same bytes
            // every two seconds was tens of thousands of writes a day.
            unsaved |= spool.len() != held;
            if unsaved {
                if !save(&path, &spool) {
                    continue;
                }
                unsaved = false;
            }
            if spool.is_empty() {
                continue;
            }
            let keys: Vec<_> = spool.keys().take(50).cloned().collect();
            let batch = keys.iter().filter_map(|k| spool.get(k).cloned()).collect();
            if send(batch).await.is_ok() {
                for key in keys {
                    spool.remove(&key);
                }
                unsaved = !save(&path, &spool);
            }
        }
    }))
}
fn save(path: &PathBuf, spool: &BTreeMap<String, Value>) -> bool {
    let temp = path.with_extension("pending");
    let Ok(bytes) = serde_json::to_vec(spool) else {
        return false;
    };
    if let Some(parent) = path.parent() {
        if std::fs::create_dir_all(parent).is_err() {
            return false;
        }
    }
    std::fs::write(&temp, bytes)
        .and_then(|_| std::fs::rename(temp, path))
        .is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn publishes_only_bounded_identity_and_state() {
        let event = json!({"event":"conversation.updated","data":{"sessionId":"s","generation":"g","turnId":"t",
            "cursor":7,"turnState":"waiting","item":{"kind":"permission","status":"pending","command":"SECRET"},"usage":{"private":"SECRET"}}});
        let value = metadata(&event).unwrap();
        assert_eq!(value["phase"], "approval_pending");
        assert!(!value.to_string().contains("SECRET"));
        assert!(
            metadata(&json!({"event":"terminal.output","data":{"output":"completed"}})).is_none()
        );
    }
}
