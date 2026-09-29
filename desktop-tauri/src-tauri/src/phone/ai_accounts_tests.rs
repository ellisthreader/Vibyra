use super::{backend::DesktopBackend, vault::Vault, workspace::SharedWorkspace};
use serde_json::json;
use std::sync::{atomic::AtomicBool, Arc};
use vibyra_core::pty::{FlushConfig, OutputSink, PtyManager};
use vibyra_host::Backend;

struct Sink;
impl OutputSink for Sink {
    fn on_output(&self, _: u64, _: String) {}
    fn on_resync(&self, _: u64, _: String) {}
    fn on_exit(&self, _: u64, _: Option<i32>) {}
}

#[test]
fn ai_account_changes_are_refused_when_phone_typing_is_off() {
    let backend = DesktopBackend::new(
        PtyManager::new(Arc::new(Sink), FlushConfig::default()),
        SharedWorkspace::default(),
        Arc::new(AtomicBool::new(false)),
        Vault::empty(),
        Default::default(),
    )
    .unwrap()
    .with_provider_auth(Some(Arc::new(
        crate::provider_auth::ProviderAuthManager::default(),
    )));
    assert_eq!(
        backend.handle("phone", "host.state", json!({})).unwrap()["capabilities"]["aiAccountsV1"],
        true
    );
    for method in [
        "aiAccounts.connect",
        "aiAccounts.disconnect",
        "aiAccounts.remove",
        "aiAccounts.install",
        "aiAccounts.setDefault",
        "aiAccounts.signInUrl",
    ] {
        let error = backend
            .handle(
                "phone",
                method,
                json!({"provider":"codex","account":"default"}),
            )
            .unwrap_err();
        assert!(
            error.contains("typing from your phone"),
            "{method}: {error}"
        );
    }
}
