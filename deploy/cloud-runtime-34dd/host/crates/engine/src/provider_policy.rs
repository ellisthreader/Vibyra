//! AI providers the account turned off for this computer (Vibyra Cloud settings,
//! docs/cloud-access-contract.md). The cloud Host learns the list from its
//! activity report reply; a Mac's embedded engine never sets it. A turned-off
//! provider is not offered in `host.state` and cannot start, resume, take a new
//! turn or sign in here. Running work is left alone until it ends.
use crate::{text, Engine};
use parking_lot::RwLock;
use serde_json::Value;

const GATED: [&str; 2] = ["claude", "codex"];

#[derive(Default)]
pub(crate) struct Disabled(RwLock<Vec<String>>);

impl Disabled {
    pub(crate) fn contains(&self, provider: &str) -> bool {
        self.0.read().iter().any(|p| p == provider)
    }
}

fn product(provider: &str) -> &'static str {
    if provider == "claude" {
        "Claude"
    } else {
        "Codex"
    }
}

impl Engine {
    /// Replaces the turned-off list. Unknown names are ignored.
    pub fn set_disabled_providers(&self, providers: &[String]) {
        let mut next: Vec<String> = GATED
            .iter()
            .filter(|p| providers.iter().any(|q| q == *p))
            .map(|p| (*p).to_owned())
            .collect();
        next.dedup();
        *self.disabled.0.write() = next;
    }

    /// `capabilities.conversationProviders` without the turned-off ones.
    pub(crate) fn offered_providers(&self) -> Vec<String> {
        self.conversation_launch
            .providers()
            .into_iter()
            .filter(|p| !self.disabled.contains(p))
            .map(str::to_owned)
            .collect()
    }

    /// Refuses a request that would run or sign in a turned-off provider.
    pub(crate) fn refuse_disabled(&self, method: &str, params: &Value) -> Result<(), String> {
        let provider = match method {
            "session.create" => params["kind"].as_str().map(str::to_owned),
            "session.resume" | "turn.submit" => text(params, "sessionId").ok().and_then(|id| {
                self.shared
                    .lock()
                    .session(id)
                    .ok()
                    .map(|s| s.meta.kind.clone())
            }),
            "aiAccounts.connect"
            | "aiAccounts.add"
            | "aiAccounts.install"
            | "aiAccounts.submit"
            | "aiAccounts.signInUrl" => params["provider"].as_str().map(str::to_owned),
            _ => None,
        };
        match provider {
            Some(p) if self.disabled.contains(&p) => Err(format!(
                "{} is turned off for Vibyra Cloud. Turn it on in Cloud settings.",
                product(&p)
            )),
            _ => Ok(()),
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::Engine;
    use serde_json::json;

    #[test]
    fn turned_off_providers_are_hidden_and_refused() {
        let dir = tempfile::tempdir().unwrap();
        let engine = Engine::new_dynamic(dir.path().join("state"), Vec::new()).unwrap();
        let state = engine.handle("phone", "host.state", json!({})).unwrap();
        assert_eq!(
            state["capabilities"]["conversationProviders"],
            json!(["codex", "claude", "gemini"])
        );
        engine.set_disabled_providers(&["claude".into(), "gemini".into()]);
        let state = engine.handle("phone", "host.state", json!({})).unwrap();
        assert_eq!(
            state["capabilities"]["conversationProviders"],
            json!(["codex", "gemini"])
        );
        let refused = engine
            .handle(
                "phone",
                "session.create",
                json!({"kind":"claude","projectId":"x"}),
            )
            .unwrap_err();
        assert!(refused.contains("Claude is turned off"), "{refused}");
        let refused = engine
            .handle("phone", "aiAccounts.connect", json!({"provider":"claude"}))
            .unwrap_err();
        assert!(refused.contains("Claude is turned off"), "{refused}");
        // Codex is still on: the request gets past the gate (and fails later on the unknown project).
        let other = engine
            .handle(
                "phone",
                "session.create",
                json!({"kind":"codex","projectId":"x"}),
            )
            .unwrap_err();
        assert!(!other.contains("turned off"), "{other}");
        engine.set_disabled_providers(&[]);
        let state = engine.handle("phone", "host.state", json!({})).unwrap();
        assert_eq!(
            state["capabilities"]["conversationProviders"],
            json!(["codex", "claude", "gemini"])
        );
    }
}
