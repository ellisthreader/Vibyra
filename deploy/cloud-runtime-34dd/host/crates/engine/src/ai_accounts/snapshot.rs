//! The account list the phone reads: every provider, its one account, the
//! CLI's status and version.
use super::{attempt::Phase, probe, view, Manager, Provider, PROBE_TTL, PROVIDERS};
use serde_json::{json, Value};
use std::{collections::HashMap, time::Instant};

impl Manager {
    /// The CLI's own status for `provider`, from cache unless `fresh`.
    pub(super) fn auth(&self, provider: &Provider, fresh: bool) -> probe::Auth {
        if !fresh {
            if let Some((at, auth)) = self.probes.lock().get(provider.id) {
                if at.elapsed() < PROBE_TTL {
                    return auth.clone();
                }
            }
        }
        let Some(program) = self.env.find(provider.program) else {
            return probe::Auth::default();
        };
        let auth = probe::probe(&self.env, provider, &program);
        self.probes
            .lock()
            .insert(provider.id, (Instant::now(), auth.clone()));
        auth
    }

    pub(super) fn version(&self, provider: &Provider) -> String {
        if let Some(known) = self.versions.lock().get(provider.id) {
            return known.clone();
        }
        let version = self
            .env
            .find(provider.program)
            .map(|program| probe::version(&self.env, &program))
            .unwrap_or_default();
        if !version.is_empty() {
            self.versions.lock().insert(provider.id, version.clone());
        }
        version
    }

    /// Every provider with its one account. `fresh` re-asks that provider's CLI
    /// instead of answering from the short cache (after an action on it).
    pub(super) fn snapshot(&self, fresh: Option<&str>) -> Value {
        // Each CLI may take seconds on a cold start: ask both at once.
        let providers: Vec<Value> = std::thread::scope(|scope| {
            let rows: Vec<_> = PROVIDERS
                .iter()
                .map(|provider| scope.spawn(move || self.provider_row(provider, fresh)))
                .collect();
            rows.into_iter()
                .map(|row| row.join().unwrap_or(Value::Null))
                .collect()
        });
        let defaults: HashMap<_, _> = PROVIDERS
            .iter()
            .map(|p| (p.id, view::DEFAULT_ACCOUNT))
            .collect();
        json!({ "providers": providers, "defaults": defaults })
    }

    fn provider_row(&self, provider: &Provider, fresh: Option<&str>) -> Value {
        let installed = self.env.find(provider.program).is_some();
        let attempt = self.attempts.view(provider.id);
        // A login that ended cleanly is asked again at once; one still
        // running cannot have connected yet, so the cache may answer.
        let ask = fresh == Some(provider.id) || attempt.phase == Phase::Exited;
        let auth = if installed {
            self.auth(provider, ask)
        } else {
            Default::default()
        };
        // A sign-in still running over a connected login (Cloud replacing a
        // copy of the Mac's) is left to finish; it ends as connected anyway.
        let attempt = if auth.connected && attempt.phase != Phase::Running {
            self.attempts.finish(provider.id);
            self.attempts.view(provider.id)
        } else {
            attempt
        };
        let secs = self.limits.login.as_secs();
        json!({
            "id": provider.id,
            "company": provider.company,
            "product": provider.product,
            "runtimeId": provider.id,
            "installed": installed,
            "package": provider.package,
            "version": if installed { self.version(provider) } else { String::new() },
            "accounts": [view::account(provider, installed, &auth, &attempt, secs)],
            "canAddAccount": false,
        })
    }
}
