use super::control_origin::loopback_origin;
use super::{Binding, PreviewService};
use crate::phone::preview_grants::attached;
use serde_json::{json, Value};
use vibyra_core::preview::PreviewPhase;

impl PreviewService {
    #[cfg(test)]
    pub(crate) fn change_runtime_id_for_test(&self, device: &str, generation: u64) {
        self.inner
            .bindings
            .lock()
            .get_mut(&(device.into(), generation))
            .unwrap()
            .runtime_id ^= 1;
    }

    pub fn start(&self, device: &str, grant_id: &str) -> Result<Value, String> {
        if let Some(result) = self.start_automatic(device, grant_id)? {
            return Ok(result);
        }
        let approved =
            self.inner
                .grants
                .authorize_id(device, grant_id, &self.inner.workspace.read())?;
        let phase = if let Some(port) = approved.attached_port {
            attached::origin(port)?;
            PreviewPhase::Running
        } else {
            let root = approved
                .source_root
                .to_str()
                .ok_or("Invalid Preview folder")?;
            self.inner
                .manager
                .start(root, &approved.target_id)
                .map_err(|e| e.to_string())?
                .phase
        };
        // Starting a new runtime invalidates every older binding for this grant.
        self.inner
            .bindings
            .lock()
            .retain(|(bound_device, _), binding| {
                bound_device != device || binding.grant_id != grant_id
            });
        Ok(json!({"phase":phase}))
    }

    pub fn open(&self, device: &str, grant_id: &str) -> Result<Value, String> {
        if let Some(result) = self.open_automatic(device, grant_id)? {
            return Ok(result);
        }
        let approved =
            self.inner
                .grants
                .authorize_id(device, grant_id, &self.inner.workspace.read())?;
        let (origin, runtime_id) = if let Some(port) = approved.attached_port {
            (attached::origin(port)?, 0)
        } else {
            let root = approved
                .source_root
                .to_str()
                .ok_or("Invalid Preview folder")?;
            let (status, runtime_id) = self
                .inner
                .manager
                .status_with_runtime(root, &approved.target_id)
                .map_err(|e| e.to_string())?;
            (
                loopback_origin(&status)?,
                runtime_id.ok_or("Preview runtime is missing")?,
            )
        };
        let mut bytes = [0u8; 8];
        getrandom::fill(&mut bytes).map_err(|e| e.to_string())?;
        let generation = u64::from_be_bytes(bytes).max(1);
        let mut bindings = self.inner.bindings.lock();
        bindings.retain(|(bound_device, _), binding| {
            bound_device != device || binding.grant_id != grant_id
        });
        bindings.insert(
            (device.into(), generation),
            Binding {
                grant_id: grant_id.into(),
                canonical_root: approved.root,
                root: approved.source_root,
                target_id: approved.target_id,
                origin,
                runtime_id,
                attached_port: approved.attached_port,
                start_path: approved.start_path.clone(),
                automatic: None,
            },
        );
        Ok(json!({"generation":generation.to_string(), "startPath":approved.start_path}))
    }

    pub(super) fn binding(&self, device: &str, generation: u64) -> Result<Binding, String> {
        let binding = self
            .inner
            .bindings
            .lock()
            .get(&(device.into(), generation))
            .cloned()
            .ok_or("Preview session expired")?;
        if let Some(server) = &binding.automatic {
            if !self.inner.typing.load(std::sync::atomic::Ordering::SeqCst)
                || !self.inner.grants.automatic(device)
                || self
                    .inner
                    .workspace
                    .read()
                    .project_root(&server.project_id)
                    .and_then(|path| path.canonicalize().ok())
                    .as_ref()
                    != Some(&server.root)
            {
                return Err("Automatic Preview permission changed".into());
            }
            return Ok(binding);
        }
        let approved = self.inner.grants.authorize_id(
            device,
            &binding.grant_id,
            &self.inner.workspace.read(),
        )?;
        if approved.root != binding.canonical_root
            || approved.source_root != binding.root
            || approved.target_id != binding.target_id
            || approved.attached_port != binding.attached_port
            || approved.start_path != binding.start_path
        {
            return Err("Preview approval changed".into());
        }
        if let Some(port) = binding.attached_port {
            if binding.runtime_id != 0
                || binding.origin.as_str() != format!("http://127.0.0.1:{port}/")
            {
                return Err("Attached Preview origin changed".into());
            }
        } else {
            let (status, runtime_id) = self
                .inner
                .manager
                .status_with_runtime(
                    binding.root.to_str().ok_or("Invalid Preview folder")?,
                    &binding.target_id,
                )
                .map_err(|e| e.to_string())?;
            if runtime_id != Some(binding.runtime_id) || loopback_origin(&status)? != binding.origin
            {
                return Err("Preview runtime restarted; reopen it".into());
            }
        }
        Ok(binding)
    }
}
