//! The isolated terminal probes never read or modify real provider accounts.
use serde_json::Value;
pub struct ProviderAuthManager;
impl crate::backend::DesktopBackend {
    pub(super) fn ai_accounts(&self, method: &str, _: &Value) -> Option<Result<Value, String>> {
        method
            .starts_with("aiAccounts.")
            .then(|| Err("Provider accounts are unavailable in this terminal probe.".into()))
    }
}
