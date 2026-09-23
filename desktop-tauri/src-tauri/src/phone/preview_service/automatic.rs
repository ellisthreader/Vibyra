use super::{discovery, Binding, PreviewService};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::sync::atomic::Ordering;
use vibyra_core::preview::PreviewPhase;

impl PreviewService {
    pub(super) fn automatic_list(
        &self,
        device: &str,
        already_granted: &HashSet<(String, u16)>,
    ) -> Vec<Value> {
        if !self.inner.grants.automatic(device) || !self.inner.typing.load(Ordering::SeqCst) {
            self.inner
                .automatic
                .lock()
                .retain(|(owner, _), _| owner != device);
            return Vec::new();
        }
        let projects = self.inner.workspace.read().preview_projects();
        let mut servers = discovery::running(&projects);
        let mut known = self.inner.automatic.lock();
        let mut keep = HashSet::new();
        let mut listed = HashSet::new();
        let mut results = Vec::new();
        for server in servers.drain(..) {
            if !listed.insert(server.project_id.clone()) {
                continue;
            }
            if already_granted.contains(&(server.project_id.clone(), server.port)) {
                continue;
            }
            let id = known
                .iter()
                .find(|((owner, _), previous)| owner == device && **previous == server)
                .map(|((_, id), _)| id.clone())
                .or_else(|| {
                    let mut bytes = [0u8; 16];
                    getrandom::fill(&mut bytes).ok()?;
                    Some(
                        bytes
                            .iter()
                            .map(|byte| format!("{byte:02x}"))
                            .collect::<String>(),
                    )
                });
            let Some(id) = id else {
                break;
            };
            keep.insert(id.clone());
            results.push(json!({"grantId":id,"projectId":server.project_id,
                "targetId":format!("auto-port:{}",server.port),
                "running":true,
                "name":format!("Current site on port {}",server.port)}));
            known.insert((device.into(), id), server);
        }
        known.retain(|(owner, id), _| owner != device || keep.contains(id));
        results
    }

    fn automatic_candidate(
        &self,
        device: &str,
        id: &str,
    ) -> Result<Option<discovery::DetectedServer>, String> {
        let Some(server) = self
            .inner
            .automatic
            .lock()
            .get(&(device.into(), id.into()))
            .cloned()
        else {
            return Ok(None);
        };
        if !self.inner.typing.load(Ordering::SeqCst) || !self.inner.grants.automatic(device) {
            return Err("Automatic Preview is off for this phone".into());
        }
        let root = self
            .inner
            .workspace
            .read()
            .project_root(&server.project_id)
            .and_then(|path| path.canonicalize().ok());
        if root.as_ref() != Some(&server.root) || !discovery::owns(&server) {
            return Err("The running site changed. Tap Preview again.".into());
        }
        Ok(Some(server))
    }

    pub(super) fn start_automatic(&self, device: &str, id: &str) -> Result<Option<Value>, String> {
        Ok(self
            .automatic_candidate(device, id)?
            .map(|_| json!({"phase":PreviewPhase::Running})))
    }

    pub(super) fn open_automatic(&self, device: &str, id: &str) -> Result<Option<Value>, String> {
        let Some(server) = self.automatic_candidate(device, id)? else {
            return Ok(None);
        };
        let mut bytes = [0u8; 8];
        getrandom::fill(&mut bytes).map_err(|error| error.to_string())?;
        let generation = u64::from_be_bytes(bytes).max(1);
        let origin = reqwest::Url::parse(&format!("http://127.0.0.1:{}/", server.port))
            .map_err(|error| error.to_string())?;
        let binding = Binding {
            grant_id: id.into(),
            canonical_root: server.root.clone(),
            root: server.root.clone(),
            target_id: format!("auto-port:{}", server.port),
            origin,
            runtime_id: 0,
            attached_port: Some(server.port),
            start_path: server.start_path.clone(),
            automatic: Some(server.clone()),
        };
        let mut bindings = self.inner.bindings.lock();
        bindings.retain(|(owner, _), previous| owner != device || previous.grant_id != id);
        bindings.insert((device.into(), generation), binding);
        Ok(Some(
            json!({"generation":generation.to_string(), "startPath":server.start_path}),
        ))
    }

    pub fn automatic_allowed(&self, device: &str) -> bool {
        self.inner.grants.automatic(device)
    }
}
