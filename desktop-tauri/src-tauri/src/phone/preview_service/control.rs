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
        super::control_access::check()?;
        if let Some(result) = self.start_automatic(device, grant_id)? {
            super::control_access::check()?;
            return Ok(result);
        }
        let approved =
            self.inner
                .grants
                .authorize_id(device, grant_id, &self.inner.workspace.read())?;
        let phase = if crate::window_preview::Target::parse(&approved.target_id)?.is_some() {
            PreviewPhase::Running
        } else if let Some(port) = approved.attached_port {
            attached::origin(port)?;
            PreviewPhase::Running
        } else {
            self.start_approved(device, grant_id, &approved)?.phase
        };
        // Starting a new runtime invalidates every older binding for this grant.
        super::control_access::check()?;
        self.inner
            .bindings
            .lock()
            .retain(|(bound_device, _), binding| {
                bound_device != device || binding.grant_id != grant_id
            });
        Ok(json!({"phase":phase}))
    }

    pub fn open(&self, device: &str, grant_id: &str) -> Result<Value, String> {
        super::control_access::check()?;
        if let Some(result) = self.open_automatic(device, grant_id)? {
            super::control_access::check()?;
            return Ok(result);
        }
        let approved =
            self.inner
                .grants
                .authorize_id(device, grant_id, &self.inner.workspace.read())?;
        let native = crate::window_preview::Target::parse(&approved.target_id)?;
        if native.is_some() {
            super::control_access::permission("screen:view")?;
        }
        // End this device's older capture before opening its replacement.
        self.inner.bindings.lock().retain(|(owner, _), previous| {
            let same_window = native.is_some_and(|target| {
                crate::window_preview::Target::parse(&previous.target_id)
                    .ok()
                    .flatten()
                    .is_some_and(|old| old.id == target.id && old.pid == target.pid)
            });
            owner != device || (previous.grant_id != grant_id && !same_window)
        });
        let window = native
            .map(crate::window_preview::Session::start)
            .transpose()?;
        super::control_access::check()?;
        let (origin, runtime_id) = if native.is_some() {
            (
                reqwest::Url::parse("http://127.0.0.1:1/").map_err(|e| e.to_string())?,
                0,
            )
        } else if let Some(port) = approved.attached_port {
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
        super::control_access::check()?;
        bindings.retain(|(bound_device, _), binding| {
            bound_device != device || binding.grant_id != grant_id
        });
        bindings.insert(
            (device.into(), generation),
            Binding {
                window,
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
        Ok(
            json!({"generation":generation.to_string(), "startPath":approved.start_path, "kind":if native.is_some() {"window"} else {"web"}}),
        )
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
            if !self.inner.grants.automatic(device)
                || self
                    .inner
                    .workspace
                    .read()
                    .project_root(&server.project_id)
                    .and_then(|path| path.canonicalize().ok())
                    .as_ref()
                    != Some(&server.project_root)
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
        if binding.window.is_some() {
            return Ok(binding);
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
