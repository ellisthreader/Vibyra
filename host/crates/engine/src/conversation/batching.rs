use serde_json::{json, Value};
use std::{
    sync::mpsc::{self, SyncSender},
    time::{Duration, Instant},
};

/// Batch token deltas before SQLite/UI work; requests and lifecycle events flush immediately.
pub(crate) fn dispatch(event: impl Fn(Value) + Send + 'static) -> SyncSender<Value> {
    let (tx, rx) = mpsc::sync_channel::<Value>(64);
    std::thread::spawn(move || {
        let mut pending: Option<Value> = None;
        let mut deadline = Instant::now() + Duration::from_millis(50);
        loop {
            let wait = if pending.is_some() {
                deadline.saturating_duration_since(Instant::now())
            } else {
                Duration::from_secs(3600)
            };
            match rx.recv_timeout(wait) {
                Ok(value)
                    if matches!(
                        value["method"].as_str(),
                        Some("item/agentMessage/delta" | "item/commandExecution/outputDelta")
                    ) =>
                {
                    let same = pending.as_ref().is_some_and(|p| {
                        p["method"] == value["method"]
                            && p["params"]["threadId"] == value["params"]["threadId"]
                            && p["params"]["itemId"] == value["params"]["itemId"]
                            && p["params"]["turnId"] == value["params"]["turnId"]
                    });
                    if !same {
                        if let Some(previous) = pending.take() {
                            event(previous);
                        }
                        deadline = Instant::now() + Duration::from_millis(50);
                        pending = Some(value);
                    } else if let Some(previous) = &mut pending {
                        let joined = format!(
                            "{}{}",
                            previous["params"]["delta"].as_str().unwrap_or(""),
                            value["params"]["delta"].as_str().unwrap_or("")
                        );
                        previous["params"]["delta"] =
                            json!(super::model::bounded(&joined, 16 * 1024));
                    }
                    if Instant::now() >= deadline {
                        if let Some(previous) = pending.take() {
                            event(previous);
                        }
                    }
                }
                Ok(value) => {
                    if let Some(previous) = pending.take() {
                        event(previous);
                    }
                    event(value);
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    if let Some(previous) = pending.take() {
                        event(previous);
                    }
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    if let Some(previous) = pending.take() {
                        event(previous);
                    }
                    break;
                }
            }
        }
    });
    tx
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rapid_tokens_coalesce_and_completion_flushes_in_order() {
        let (tx, rx) = mpsc::channel();
        let sender = dispatch(move |event| {
            tx.send(event).unwrap();
        });
        for _ in 0..1000 {
            sender
                .send(json!({"method":"item/agentMessage/delta",
            "params":{"itemId":"message","turnId":"turn","delta":"a"}}))
                .unwrap();
        }
        sender.send(json!({"method":"turn/completed"})).unwrap();
        drop(sender);
        let events: Vec<_> = rx.iter().collect();
        assert!(
            events.len() < 100,
            "1000 tokens must not cause 1000 durable writes"
        );
        assert_eq!(events.last().unwrap()["method"], "turn/completed");
        assert_eq!(
            events
                .iter()
                .filter_map(|e| e["params"]["delta"].as_str())
                .map(str::len)
                .sum::<usize>(),
            1000
        );
    }
    #[test]
    fn idle_provider_flushes_last_tokens_without_waiting_for_another_event() {
        let (tx, rx) = mpsc::channel();
        let sender = dispatch(move |event| {
            tx.send(event).unwrap();
        });
        sender
            .send(json!({"method":"item/agentMessage/delta","params":{"itemId":"message","delta":"Hi"}}))
            .unwrap();
        assert_eq!(
            rx.recv_timeout(Duration::from_secs(1)).unwrap()["params"]["delta"],
            "Hi"
        );
    }
}
