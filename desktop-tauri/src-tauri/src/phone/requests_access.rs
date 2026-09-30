//! A renderer request never gains longer-lived authority than its originating socket.
use super::TerminalRequests;
use serde_json::Value;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::Instant;
use vibyra_host::PreviewAccess;

const DENIED: &str = "This phone request is no longer authorized. Connect again.";

#[derive(Clone)]
pub struct EffectGuard {
    request: Value,
    access: Option<Arc<dyn PreviewAccess>>,
    active: Arc<AtomicBool>,
    deadline: Instant,
}
impl EffectGuard {
    pub(super) fn new(request: Value) -> Self {
        Self {
            request,
            access: vibyra_host::current_rpc_access(),
            active: Arc::new(AtomicBool::new(true)),
            deadline: Instant::now() + super::WINDOW_TIMEOUT,
        }
    }
    /// Native effects recheck after every async preflight, immediately before mutation.
    pub fn check(&self, permission: &str) -> Result<(), String> {
        if self.active.load(Ordering::SeqCst)
            && Instant::now() < self.deadline
            && self
                .access
                .as_ref()
                .is_some_and(|access| access.permits(permission))
        {
            Ok(())
        } else {
            Err(DENIED.into())
        }
    }
    pub fn request(&self) -> &Value {
        &self.request
    }
    pub(super) fn cancel(&self) {
        self.active.store(false, Ordering::SeqCst);
    }
}
impl TerminalRequests {
    /// Bind a native effect to the exact queued action and its published identities.
    pub fn authorize_effect(
        &self,
        id: &str,
        actions: &[&str],
        project: Option<&str>,
        pane: Option<i64>,
    ) -> Result<EffectGuard, String> {
        let guard = self.guards.lock().get(id).cloned().ok_or(DENIED)?;
        let request = guard.request();
        if !request["action"]
            .as_str()
            .is_some_and(|action| actions.contains(&action))
            || project.is_some_and(|project| request["projectId"].as_str() != Some(project))
            || pane.is_some_and(|pane| request["paneId"].as_i64() != Some(pane))
        {
            return Err("This phone request does not authorize that action or target.".into());
        }
        guard.check("terminal:access")?;
        Ok(guard)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    struct Access(AtomicBool);
    impl PreviewAccess for Access {
        fn permits(&self, permission: &str) -> bool {
            self.0.load(Ordering::SeqCst) && permission == "terminal:access"
        }
    }
    #[test]
    fn queued_native_effect_rechecks_revocation_and_exact_request_target() {
        let access = Arc::new(Access(AtomicBool::new(true)));
        let requests = TerminalRequests::default();
        let guard = vibyra_host::with_rpc_access(access.clone(), || {
            EffectGuard::new(json!({"action":"resumeSaved","projectId":"p","paneId":-1}))
        });
        requests
            .guards
            .lock()
            .insert("random".into(), guard.clone());
        let admitted = requests
            .authorize_effect("random", &["resumeSaved"], Some("p"), Some(-1))
            .unwrap();
        for (id, action, project, pane) in [
            ("wrong", "resumeSaved", "p", -1),
            ("random", "create", "p", -1),
            ("random", "resumeSaved", "other", -1),
            ("random", "resumeSaved", "p", -2),
        ] {
            assert!(requests
                .authorize_effect(id, &[action], Some(project), Some(pane))
                .is_err());
        }
        // Simulate an async preflight ending after the originating grant was revoked.
        access.0.store(false, Ordering::SeqCst);
        let effects = AtomicBool::new(false);
        if admitted.check("terminal:access").is_ok() {
            effects.store(true, Ordering::SeqCst);
        }
        assert!(!effects.load(Ordering::SeqCst));
        access.0.store(true, Ordering::SeqCst);
        admitted.check("terminal:access").unwrap();
        guard.cancel();
        assert!(admitted.check("terminal:access").is_err());
        assert!(
            vibyra_host::current_rpc_access().is_none(),
            "dispatch context must not leak"
        );
    }
    #[test]
    fn missing_transport_context_and_expired_renderer_requests_fail_closed() {
        let local = EffectGuard::new(json!({"action":"create"}));
        assert!(local.check("terminal:access").is_err());
        let access = Arc::new(Access(AtomicBool::new(true)));
        let mut expired =
            vibyra_host::with_rpc_access(access, || EffectGuard::new(json!({"action":"create"})));
        expired.deadline = Instant::now() - std::time::Duration::from_millis(1);
        assert!(expired.check("terminal:access").is_err());
    }
}
