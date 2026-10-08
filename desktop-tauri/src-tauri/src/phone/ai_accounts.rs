//! Account status and explicit actions for a trusted phone paired to this Mac.
//! Provider credentials stay in the CLI's local account folder.
use crate::provider_auth_state::ProviderView;
use serde_json::{json, Value};

use super::backend::DesktopBackend;

impl DesktopBackend {
    pub(super) fn ai_accounts(
        &self,
        method: &str,
        params: &Value,
    ) -> Option<Result<Value, String>> {
        if !method.starts_with("aiAccounts.") {
            return None;
        }
        let Some(manager) = &self.provider_auth else {
            return Some(Err(
                "Update Vibyra on your Mac to manage AI accounts.".into()
            ));
        };
        if method == "aiAccounts.list" {
            return Some(Ok(self.account_snapshot()));
        }
        if !self.control.typing() {
            return Some(Err(
                "Turn on typing from your phone in Vibyra on your Mac to change AI accounts."
                    .into(),
            ));
        }
        let provider = params["provider"].as_str().unwrap_or_default();
        let account = params["account"].as_str().unwrap_or_default();
        let result = match method {
            "aiAccounts.agent" => self
                .requests
                .ask(json!({"action":"optionalAgent",
                "agent":provider,"operation":params["value"]}))
                .map(|_| self.account_snapshot()),
            "aiAccounts.connect" => manager
                .connect_from_phone(provider, account)
                .map(|views| self.account_snapshot_with(views)),
            "aiAccounts.add" => manager
                .add_account_from_phone(provider)
                .map(|views| self.account_snapshot_with(views)),
            "aiAccounts.install" => manager
                .install(provider)
                .map(|views| self.account_snapshot_with(views)),
            "aiAccounts.cancel" => manager
                .cancel(provider, account)
                .map(|views| self.account_snapshot_with(views)),
            "aiAccounts.disconnect" => manager
                .disconnect(provider, account)
                .map(|views| self.account_snapshot_with(views)),
            "aiAccounts.remove" => manager
                .remove_account(provider, account)
                .map(|views| self.account_snapshot_with(views)),
            "aiAccounts.submit" => {
                let value = params["value"].as_str().unwrap_or_default();
                if value.is_empty() || value.len() > 4096 {
                    Err("Enter the requested sign-in answer.".into())
                } else {
                    manager
                        .submit(provider, account, value)
                        .map(|views| self.account_snapshot_with(views))
                }
            }
            "aiAccounts.signInUrl" => manager
                .phone_sign_in_url(provider, account)
                .map(|url| json!({"url":url})),
            "aiAccounts.openOnMac" => manager
                .open_sign_in_page(provider, account)
                .map(|_| json!({"ok":true})),
            "aiAccounts.setDefault" => {
                let connected = manager
                    .accounts()
                    .iter()
                    .find(|item| item.id == provider)
                    .is_some_and(|item| {
                        item.accounts
                            .iter()
                            .any(|row| row.account_id == account && row.status == "connected")
                    });
                if !connected {
                    Err("That account is not signed in on this Mac.".into())
                } else {
                    self.requests.ask(json!({"action":"accountDefault","provider":provider,"account":account}))
                    .map(|_| self.account_snapshot())
                }
            }
            _ => Err("Unknown AI account action.".into()),
        };
        Some(result)
    }

    fn account_snapshot(&self) -> Value {
        let providers = self
            .provider_auth
            .as_ref()
            .map(|manager| manager.accounts())
            .unwrap_or_default();
        self.account_snapshot_with(providers)
    }

    fn account_snapshot_with(&self, mut providers: Vec<ProviderView>) -> Value {
        if !self.control.typing() {
            hide_auth_challenges(&mut providers);
        }
        let defaults = self
            .requests
            .ask(json!({"action":"accountDefaults"}))
            .unwrap_or(json!({}));
        let agents = self
            .requests
            .ask(json!({"action":"optionalAgents"}))
            .unwrap_or(json!([]));
        json!({"providers":providers,"defaults":defaults,"agents":agents})
    }
}

fn hide_auth_challenges(providers: &mut [ProviderView]) {
    for provider in providers {
        for account in &mut provider.accounts {
            account.device_code.clear();
            account.prompt.clear();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::provider_auth_state::ProviderAccountView;

    #[test]
    fn view_only_phone_cannot_read_a_pending_auth_challenge() {
        let mut providers = vec![ProviderView {
            id: "codex".into(),
            company: "OpenAI".into(),
            product: "ChatGPT".into(),
            runtime_id: "codex".into(),
            installed: true,
            package: "@openai/codex".into(),
            can_add_account: false,
            accounts: vec![ProviderAccountView {
                account_id: "default".into(),
                status: "connecting".into(),
                account_label: "".into(),
                detail: "Signing in".into(),
                sign_in_page_available: true,
                device_code: "ABCD-EFGH".into(),
                prompt: "Enter code".into(),
                removable: false,
            }],
        }];
        hide_auth_challenges(&mut providers);
        assert!(providers[0].accounts[0].device_code.is_empty());
        assert!(providers[0].accounts[0].prompt.is_empty());
        assert_eq!(providers[0].accounts[0].status, "connecting");
    }
}
