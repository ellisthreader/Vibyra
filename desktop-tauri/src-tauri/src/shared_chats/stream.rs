use super::SharedChats;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    sync::{mpsc, Arc},
    time::{Duration, Instant},
};
impl SharedChats {
    pub fn subscribe(self: &Arc<Self>) -> mpsc::Receiver<Value> {
        let (tx, rx) = mpsc::sync_channel(256);
        let weak = Arc::downgrade(self);
        std::thread::spawn(move || {
            let mut readers = HashMap::new();
            let mut pulse = Instant::now();
            loop {
                let Some(chats) = weak.upgrade() else {
                    return;
                };
                for slot in chats.slots.lock().iter() {
                    if !readers.contains_key(&slot.project.id) {
                        readers.insert(slot.project.id.clone(), slot.engine.subscribe());
                        if tx.send(json!({"event":"host.changed","data":{}})).is_err() {
                            return;
                        }
                    }
                }
                drop(chats);
                let mut lost = vec![];
                for (id, reader) in &readers {
                    loop {
                        match reader.try_recv() {
                            Ok(event) => {
                                if tx.send(event).is_err() {
                                    return;
                                }
                            }
                            Err(mpsc::TryRecvError::Empty) => break,
                            Err(mpsc::TryRecvError::Disconnected) => {
                                lost.push(id.clone());
                                break;
                            }
                        }
                    }
                }
                // Engine deliberately drops lagging subscribers. Reattach and
                // explicitly reload snapshots; never leave a silent stale chat.
                if !lost.is_empty() {
                    if tx.send(json!({"event":"host.changed","data":{}})).is_err() {
                        return;
                    }
                    for id in lost {
                        readers.remove(&id);
                    }
                    if tx
                        .send(json!({"event":"conversation.resync","data":{}}))
                        .is_err()
                    {
                        return;
                    }
                }
                if pulse.elapsed() >= Duration::from_secs(2) {
                    if tx.send(json!({"event":"shared.pulse","data":{}})).is_err() {
                        return;
                    }
                    pulse = Instant::now();
                }
                std::thread::sleep(Duration::from_millis(50));
            }
        });
        rx
    }
}
