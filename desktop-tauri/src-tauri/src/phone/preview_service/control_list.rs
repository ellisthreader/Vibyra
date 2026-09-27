use super::PreviewService;
use crate::phone::preview_grants::attached;
use serde_json::{json, Value};
use std::collections::HashSet;
use vibyra_core::preview::PreviewPhase;

impl PreviewService {
    pub fn list(&self, device: &str) -> Value {
        let workspace = self.inner.workspace.read();
        let scopes = self
            .inner
            .grants
            .list_for_device(device)
            .into_iter()
            .filter_map(|scope| {
                let approved = self
                    .inner
                    .grants
                    .authorize_id(device, &scope.id, &workspace)
                    .ok()?;
                let live = if let Some(port) = approved.attached_port {
                    attached::origin(port).is_ok()
                } else {
                    approved
                        .source_root
                        .to_str()
                        .and_then(|root| self.inner.manager.status(root, &approved.target_id).ok())
                        .is_some_and(|status| status.phase == PreviewPhase::Running)
                };
                Some((
                    json!({"grantId":scope.id,"projectId":scope.project_id,
                "targetId":scope.target_id,
                "running":live,
                "name":scope.target_id.strip_prefix("attached-port:")
                    .map(|port| format!("Local server on port {port}"))}),
                    approved.attached_port,
                    live,
                ))
            })
            .collect::<Vec<_>>();
        let granted_ports = scopes
            .iter()
            .filter_map(|(target, port, live): &(Value, Option<u16>, bool)| {
                if !live {
                    return None;
                }
                Some((target["projectId"].as_str()?.to_owned(), (*port)?))
            })
            .collect::<HashSet<_>>();
        drop(workspace);
        let automatic = self.automatic_list(device, &granted_ports);
        let current_projects = automatic
            .iter()
            .filter_map(|target| target["projectId"].as_str())
            .collect::<HashSet<_>>();
        let mut scopes = scopes
            .into_iter()
            .filter_map(|(target, _, live)| {
                (live || !current_projects.contains(target["projectId"].as_str().unwrap_or("")))
                    .then_some(target)
            })
            .collect::<Vec<_>>();
        scopes.extend(automatic);
        json!({"targets":scopes})
    }
}
