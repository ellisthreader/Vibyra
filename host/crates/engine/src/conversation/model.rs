use super::runtime::Runtime;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{collections::HashMap, sync::Arc};

#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Conversation {
    pub generation: String,
    pub thread_id: String,
    pub cursor: u64,
    pub turn_id: Option<String>,
    #[serde(default)]
    pub active_submission: Option<String>,
    pub turn_state: String,
    pub process_state: String,
    pub items: Vec<Value>,
    pub events: Vec<Value>,
    pub receipts: HashMap<String, Value>,
    #[serde(skip)]
    pub runtime: Option<Arc<Runtime>>,
}
impl Conversation {
    pub fn new(generation: String) -> Self {
        Self {
            generation,
            turn_state: "idle".into(),
            process_state: "running".into(),
            ..Self::default()
        }
    }
    pub fn restore(&mut self) {
        self.process_state = "interrupted".into();
        if matches!(self.turn_state.as_str(), "running" | "waiting") {
            self.turn_state = "interrupted".into();
        }
        for item in &mut self.items {
            match item["status"].as_str() {
                Some("pending") => item["status"] = json!("expired"),
                Some("responding") => item["status"] = json!("unknown"),
                Some("running") => item["status"] = json!("interrupted"),
                _ => {}
            }
        }
        for receipt in self.receipts.values_mut() {
            if receipt["status"] == "dispatching" {
                receipt["status"] = json!("unknown");
            }
        }
    }
    pub fn update(&mut self, session: &str, project: &str, mut item: Option<Value>) -> Value {
        self.cursor += 1;
        if let Some(value) = &mut item {
            value["cursor"] = json!(self.cursor);
            if let Some(previous) = self.items.iter_mut().find(|old| old["id"] == value["id"]) {
                value["order"] = previous["order"].clone();
                *previous = value.clone();
            } else {
                value["order"] = json!(self.cursor);
                self.items.push(value.clone());
            }
            // Retain outstanding decisions even when compacting old completed history.
            while self.items.len() > 512 {
                let index = self
                    .items
                    .iter()
                    .position(|i| !matches!(i["status"].as_str(), Some("pending" | "responding")));
                if let Some(index) = index {
                    self.items.remove(index);
                } else {
                    break;
                }
            }
        }
        let event = json!({"sessionId":session,"projectId":project,"generation":self.generation,
            "cursor":self.cursor,"turnId":self.turn_id,"turnState":self.turn_state,
            "processState":self.process_state,"item":item});
        self.events.push(event.clone());
        if self.events.len() > 128 {
            self.events.remove(0);
        }
        event
    }
    pub fn snapshot(&self, session: &str, project: &str, before: Option<u64>) -> Value {
        let mut candidates: Vec<_> = self
            .items
            .iter()
            .filter(|i| before.is_none_or(|b| i["order"].as_u64().unwrap_or(0) < b))
            .collect();
        candidates.sort_by_key(|i| i["order"].as_u64().unwrap_or(0));
        let mut items = Vec::new();
        let mut size = 0;
        let pending: Vec<_> = self
            .items
            .iter()
            .filter(|i| matches!(i["status"].as_str(), Some("pending" | "responding")))
            .collect();
        let budget = 45 * 1024
            - serde_json::to_vec(&pending)
                .map_or(0, |v| v.len())
                .min(40 * 1024);
        for item in candidates.iter().rev() {
            size += serde_json::to_vec(item).map_or(0, |v| v.len());
            if size > budget {
                break;
            }
            items.push((*item).clone());
        }
        items.reverse();
        json!({"sessionId":session,"projectId":project,"generation":self.generation,"cursor":self.cursor,
            "turnId":self.turn_id,"turnState":self.turn_state,"processState":self.process_state,
            "items":items,"pending":pending,"hasMore":items.len()<candidates.len()})
    }
}
pub(crate) fn bounded(value: &str, bytes: usize) -> String {
    let mut end = value.len().min(bytes);
    while !value.is_char_boundary(end) {
        end -= 1;
    }
    value[..end].to_owned()
}
