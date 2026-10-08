//! Provider sign-in for a headless Host (the cloud computer): the phone's
//! Accounts page drives `aiAccounts.*`, this runs `codex` and `claude` as the
//! Host's own user and reports their status. Only the default account at
//! `$HOME` exists here; credentials stay in the CLIs' own folders and never
//! appear in any reply.
mod actions;
mod attempt;
mod attempts;
mod device_code;
mod env;
mod output;
mod probe;
mod snapshot;
mod url;
mod view;

use attempt::Limits;
use attempts::Attempts;
use env::Env;
use parking_lot::Mutex;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant},
};

/// A status read this recent answers the next ask, unless a sign-in is moving.
const PROBE_TTL: Duration = Duration::from_secs(5);

pub(crate) struct Provider {
    pub id: &'static str,
    pub company: &'static str,
    pub product: &'static str,
    pub program: &'static str,
    pub package: &'static str,
}

const PROVIDERS: [Provider; 2] = [
    Provider {
        id: "codex",
        company: "OpenAI",
        product: "ChatGPT",
        program: "codex",
        package: "@openai/codex",
    },
    Provider {
        id: "claude",
        company: "Anthropic",
        product: "Claude",
        program: "claude",
        package: "@anthropic-ai/claude-code",
    },
];

pub(crate) struct Manager {
    env: Env,
    attempts: Arc<Attempts>,
    limits: Limits,
    probes: Mutex<HashMap<&'static str, (Instant, probe::Auth)>>,
    versions: Mutex<HashMap<&'static str, String>>,
}

impl Default for Manager {
    fn default() -> Self {
        Self::build(Env::default(), Limits::default())
    }
}

impl Manager {
    fn build(env: Env, limits: Limits) -> Self {
        Self {
            env,
            attempts: Arc::new(Attempts::new(limits)),
            limits,
            probes: Mutex::default(),
            versions: Mutex::default(),
        }
    }

    /// Whether either CLI is on PATH; the capability is advertised only then.
    pub fn available(&self) -> bool {
        PROVIDERS.iter().any(|p| self.env.find(p.program).is_some())
    }

    pub fn handle(&self, method: &str, params: &Value) -> Result<Value, String> {
        let name = method.strip_prefix("aiAccounts.").unwrap_or_default();
        if matches!(name, "list" | "refresh") {
            return Ok(self.snapshot(None));
        }
        let provider = params["provider"].as_str().unwrap_or_default();
        let provider = PROVIDERS
            .iter()
            .find(|p| p.id == provider)
            .ok_or("Unknown AI account provider.")?;
        let account = params["account"].as_str().unwrap_or(view::DEFAULT_ACCOUNT);
        if !matches!(account, "" | view::DEFAULT_ACCOUNT) {
            return Err("This computer has one account per provider.".into());
        }
        let id = provider.id;
        match name {
            "connect" | "add" => self.connect(provider)?,
            "cancel" => self.attempts.cancel(id),
            "disconnect" => self.disconnect(provider)?,
            "submit" => self.submit(provider, params["value"].as_str().unwrap_or_default())?,
            "signInUrl" => {
                return self
                    .attempts
                    .sign_in_url(id)
                    .map(|url| json!({ "url": url }))
                    .ok_or_else(|| {
                        format!(
                            "Waiting for {} to provide its sign-in page.",
                            provider.product
                        )
                    });
            }
            "install" if self.env.find(provider.program).is_some() => {}
            "install" => {
                return Err(format!(
                    "{} comes with this computer and is missing; contact support.",
                    provider.product
                ));
            }
            "setDefault" => {}
            "remove" => {
                return Err("The account on this computer can be signed out, not removed.".into())
            }
            "openOnMac" => {
                return Err(
                    "There is no Mac screen here; open the sign-in page on your phone.".into(),
                )
            }
            _ => return Err("Unknown AI account action.".into()),
        }
        Ok(self.snapshot(Some(id)))
    }
}

#[cfg(all(test, unix))]
mod fixtures;
#[cfg(all(test, unix))]
mod tests;
#[cfg(all(test, unix))]
mod tests_login;
