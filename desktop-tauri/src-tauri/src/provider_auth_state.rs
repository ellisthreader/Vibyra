use serde::Serialize;
use serde_json::Value;
use vibyra_core::agents::program_in_path;

use crate::provider_auth_process::command_output;

#[derive(Clone, Copy)]
pub struct ProviderDefinition {
    pub id: &'static str,
    pub company: &'static str,
    pub product: &'static str,
    pub runtime_id: &'static str,
    pub program: &'static str,
}

#[derive(Clone, Default)]
pub struct AuthSnapshot {
    pub connected: bool,
    pub probe_failed: bool,
    pub account_label: String,
    pub detail: String,
}

impl AuthSnapshot {
    pub fn failed() -> Self {
        Self {
            probe_failed: true,
            ..Self::default()
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderAccountView {
    pub id: String,
    pub company: String,
    pub product: String,
    pub runtime_id: String,
    pub installed: bool,
    pub status: String,
    pub account_label: String,
    pub detail: String,
    pub sign_in_page_available: bool,
}

pub const PROVIDERS: [ProviderDefinition; 3] = [
    ProviderDefinition {
        id: "codex",
        company: "OpenAI",
        product: "ChatGPT",
        runtime_id: "codex",
        program: "codex",
    },
    ProviderDefinition {
        id: "claude",
        company: "Anthropic",
        product: "Claude",
        runtime_id: "claude",
        program: "claude",
    },
    ProviderDefinition {
        id: "gemini",
        company: "Google",
        product: "Gemini",
        runtime_id: "gemini",
        program: "gemini",
    },
];

pub fn definition(id: &str) -> Option<ProviderDefinition> {
    PROVIDERS.iter().copied().find(|provider| provider.id == id)
}

pub fn installed(provider: ProviderDefinition) -> bool {
    program_in_path(provider.program)
}

pub fn probe(provider: ProviderDefinition) -> AuthSnapshot {
    match provider.id {
        "codex" => crate::provider_auth_codex::probe(provider.program),
        "claude" => probe_claude(provider.program),
        "gemini" => crate::provider_auth_gemini::probe(),
        _ => AuthSnapshot::default(),
    }
}

pub fn probe_all() -> Vec<(ProviderDefinition, bool, AuthSnapshot)> {
    std::thread::scope(|scope| {
        let handles: Vec<_> = PROVIDERS
            .iter()
            .copied()
            .map(|provider| {
                (
                    provider,
                    scope.spawn(move || {
                        let available = installed(provider);
                        let auth = if available {
                            probe(provider)
                        } else {
                            AuthSnapshot::default()
                        };
                        (provider, available, auth)
                    }),
                )
            })
            .collect();
        handles
            .into_iter()
            .map(|(provider, handle)| match handle.join() {
                Ok(result) => result,
                Err(_) => (provider, installed(provider), AuthSnapshot::failed()),
            })
            .collect()
    })
}

fn probe_claude(program: &str) -> AuthSnapshot {
    let Some((success, output)) = command_output(program, &["auth", "status", "--json"]) else {
        return AuthSnapshot::failed();
    };
    let Ok(value) = serde_json::from_str::<Value>(&output) else {
        return AuthSnapshot::failed();
    };
    let auth_method = value
        .get("authMethod")
        .and_then(Value::as_str)
        .unwrap_or("");
    if !success
        || auth_method != "claude.ai"
        || !value
            .get("loggedIn")
            .and_then(Value::as_bool)
            .unwrap_or(false)
    {
        return AuthSnapshot::default();
    }
    let email = value
        .get("email")
        .and_then(Value::as_str)
        .unwrap_or("Claude account");
    let plan = value
        .get("subscriptionType")
        .and_then(Value::as_str)
        .unwrap_or("");
    AuthSnapshot {
        connected: true,
        account_label: safe_label(email, "Claude account"),
        detail: product_detail("Claude", plan),
        ..AuthSnapshot::default()
    }
}

fn safe_label(value: &str, fallback: &str) -> String {
    let value = value.trim();
    if value.is_empty() {
        fallback.into()
    } else {
        value.chars().take(180).collect()
    }
}

fn product_detail(product: &str, plan: &str) -> String {
    let plan = plan.trim();
    if plan.is_empty() {
        product.into()
    } else {
        format!("{product} {}", title_case(plan))
    }
}

fn title_case(value: &str) -> String {
    let mut chars = value.chars();
    chars
        .next()
        .map(|first| first.to_uppercase().collect::<String>() + chars.as_str())
        .unwrap_or_default()
}

#[cfg(test)]
#[path = "provider_auth_state_tests.rs"]
mod tests;
