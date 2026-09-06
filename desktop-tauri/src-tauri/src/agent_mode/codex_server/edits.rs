//! Bind a file approval to the exact pending provider item and native grants.
use crate::agent_mode::bridge::wire::{BridgeRequest, TcpWire, Wire};
use serde_json::{json, Value};
use std::collections::HashMap;
use vibyra_core::agent_runtime::PermissionBridge;

#[derive(Default)]
pub struct Pending(HashMap<String, Value>);
impl Pending {
    pub fn observe(&mut self, method: &str, params: &Value) {
        if method == "item/fileChange/patchUpdated" {
            if let Some(changes) = params["itemId"].as_str().and_then(|id| self.0.get_mut(id)) {
                *changes = params["changes"].clone();
            }
            return;
        }
        let item = &params["item"];
        let Some(id) = item["id"].as_str() else {
            return;
        };
        if method == "item/completed" {
            self.0.remove(id);
        } else if method == "item/started" && item["type"] == "fileChange" && self.0.len() < 8 {
            self.0.insert(id.into(), item["changes"].clone());
        }
    }
    pub fn respond(&mut self, params: &Value, bridge: &PermissionBridge) -> Value {
        self.decide(params, |path, changes| {
            TcpWire::new(bridge.port)
                .ask(BridgeRequest {
                    token: bridge.token.clone(),
                    chat_id: bridge.chat_id.clone(),
                    turn_id: bridge.turn_id.clone(),
                    tool_name: "Edit".into(),
                    tool_use_id: params["itemId"].as_str().map(str::to_owned),
                    input: json!({"file_path":path,"changes":changes,"providerRequest":params}),
                })
                .behavior
                == "allow"
        })
    }
    fn decide(&mut self, params: &Value, mut allow: impl FnMut(&str, &Value) -> bool) -> Value {
        let changes = params["itemId"].as_str().and_then(|id| self.0.remove(id));
        let accepted = params["grantRoot"].is_null()
            && changes.as_ref().is_some_and(|changes| {
                let Some(paths) = targets(changes) else {
                    return false;
                };
                paths.into_iter().all(|path| allow(path, changes))
            });
        json!({"decision":if accepted {"accept"} else {"decline"}})
    }
}
fn targets(changes: &Value) -> Option<Vec<&str>> {
    let changes = changes
        .as_array()
        .filter(|v| !v.is_empty() && v.len() <= 256)?;
    let mut paths = Vec::new();
    for change in changes {
        let kind = change["kind"]["type"].as_str()?;
        if !["add", "update", "delete"].contains(&kind) || !change["diff"].is_string() {
            return None;
        }
        paths.push(change["path"].as_str()?);
        if !change["kind"]["move_path"].is_null() {
            if kind != "update" {
                return None;
            }
            paths.push(change["kind"]["move_path"].as_str()?);
        }
    }
    paths
        .iter()
        .all(|p| std::path::Path::new(p).is_absolute())
        .then_some(paths)
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    fn pending() -> Pending {
        let mut pending = Pending::default();
        pending.observe("item/started", &json!({"item":{"id":"edit","type":"fileChange","changes":[
            {"path":"/granted/a","kind":{"type":"update","move_path":"/outside/b"},"diff":"fixture"}
        ]}}));
        pending
    }
    #[test]
    fn every_rename_target_is_checked_and_approvals_are_not_reusable() {
        let request = json!({"itemId":"edit"});
        let mut pending = pending();
        let mut seen = Vec::new();
        assert_eq!(
            pending.decide(&request, |p, _| {
                seen.push(p.to_owned());
                p.starts_with("/granted/")
            })["decision"],
            "decline"
        );
        assert_eq!(seen, ["/granted/a", "/outside/b"]);
        assert_eq!(pending.decide(&request, |_, _| true)["decision"], "decline");
    }
    #[test]
    fn root_expansion_unknown_items_and_completed_edits_are_declined() {
        assert_eq!(
            pending().decide(&json!({"itemId":"edit","grantRoot":"/"}), |_, _| panic!())
                ["decision"],
            "decline"
        );
        let mut pending = pending();
        assert_eq!(
            pending.decide(&json!({"itemId":"unknown"}), |_, _| panic!())["decision"],
            "decline"
        );
        pending.observe("item/completed", &json!({"item":{"id":"edit"}}));
        assert_eq!(
            pending.decide(&json!({"itemId":"edit"}), |_, _| panic!())["decision"],
            "decline"
        );
    }
    #[test]
    fn updated_patches_are_checked_against_their_latest_paths() {
        let mut pending = pending();
        pending.observe(
            "item/fileChange/patchUpdated",
            &json!({"itemId":"edit","changes":[
                {"path":"/outside/latest","kind":{"type":"add"},"diff":"updated fixture"}
            ]}),
        );
        assert_eq!(
            pending.decide(&json!({"itemId":"edit"}), |path, _| {
                assert_eq!(path, "/outside/latest");
                false
            })["decision"],
            "decline"
        );
    }
}
