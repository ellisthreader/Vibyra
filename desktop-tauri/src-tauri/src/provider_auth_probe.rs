//! Asking every account whether it is still signed in, without making the
//! Integrations pane wait for all of them in a row.
//!
//! One account used to mean three CLI spawns per refresh. Several accounts per
//! provider multiplies that, and the pane polls every 1.8s while a sign-in is
//! in flight, so two things keep it honest:
//!
//! * a ceiling on how many CLIs run at once, so a full list cannot fork a
//!   dozen processes at a stroke, and
//! * a short cache of what the CLIs last said, so the poll re-renders from
//!   memory instead of re-interrogating accounts nobody touched.
//!
//! The CLI stays the authority on whether a token is still good — the cache
//! only decides how often to ask, never what the answer is.

use std::collections::HashMap;
use std::time::{Duration, Instant};

use crate::provider_auth_home::AccountHome;
use crate::provider_auth_registry::Registry;
use crate::provider_auth_state::{installed, AuthSnapshot, ProviderDefinition, PROVIDERS};

/// How many provider CLIs may be running at once. Each is a Node wrapper round
/// a large native binary, so this is about memory and disk churn rather than
/// CPU.
const MAX_CONCURRENT: usize = 6;

/// How long a probe result stands before it is asked again.
///
/// This is the one place staleness can show: a sign-in or sign-out made
/// *outside* Vibyra — `codex logout` in a terminal — takes up to this long to
/// reach the pane. Everything done through Vibyra re-asks immediately, because
/// the account acted on is always forced. The trade buys a great deal: during
/// a browser sign-in the pane polls every 1.8s, and without this every poll
/// would spawn a CLI for every account the user holds.
pub const CACHE_TTL: Duration = Duration::from_secs(3);

/// One account's identity for probing: which provider, and which folder.
#[derive(Clone)]
pub struct ProbeTarget {
    pub provider: ProviderDefinition,
    pub account_id: String,
    pub home: AccountHome,
}

/// Identifies one account across the probe cache and the attempt store alike,
/// so a sign-in in flight and the answer it produces are filed together.
pub type ProbeKey = String;

pub fn key(provider: &str, account_id: &str) -> ProbeKey {
    format!("{provider}:{account_id}")
}

/// Every account currently held, in the order the pane shows them.
pub fn targets(registry: &Registry) -> Vec<ProbeTarget> {
    PROVIDERS
        .iter()
        .copied()
        .flat_map(|provider| {
            registry
                .ids(provider.id)
                .into_iter()
                .filter_map(move |account_id| {
                    let home = registry.home(provider.id, &account_id).ok()?;
                    Some(ProbeTarget {
                        provider,
                        account_id,
                        home,
                    })
                })
        })
        .collect()
}

pub fn probe(provider: ProviderDefinition, home: &AccountHome) -> AuthSnapshot {
    match provider.id {
        "codex" => crate::provider_auth_codex::probe(provider.program, home),
        "claude" => crate::provider_auth_claude::probe(provider.program, home),
        "gemini" => crate::provider_auth_gemini::probe(home),
        _ => AuthSnapshot::default(),
    }
}

/// What the last round of probing found, and when.
#[derive(Default)]
pub struct ProbeCache {
    entries: HashMap<ProbeKey, (Instant, AuthSnapshot)>,
}

impl ProbeCache {
    /// Probes every target whose answer has gone stale, keeping the rest.
    ///
    /// `force` re-asks these accounts regardless: the one the user just acted
    /// on, and any with a sign-in still running. Their whole point is that the
    /// answer is expected to change, so a cached one would be wrong.
    pub fn refresh(
        &mut self,
        targets: &[ProbeTarget],
        force: &[ProbeKey],
    ) -> HashMap<ProbeKey, AuthSnapshot> {
        let now = Instant::now();
        let stale: Vec<&ProbeTarget> = targets
            .iter()
            .filter(|target| {
                let id = key(target.provider.id, &target.account_id);
                if force.contains(&id) {
                    return true;
                }
                match self.entries.get(&id) {
                    Some((at, _)) => now.duration_since(*at) >= CACHE_TTL,
                    None => true,
                }
            })
            .collect();

        for chunk in stale.chunks(MAX_CONCURRENT) {
            for (id, snapshot) in run(chunk) {
                self.entries.insert(id, (Instant::now(), snapshot));
            }
        }

        self.entries.retain(|id, _| {
            targets
                .iter()
                .any(|target| key(target.provider.id, &target.account_id) == *id)
        });
        self.entries
            .iter()
            .map(|(id, (_, snapshot))| (id.clone(), snapshot.clone()))
            .collect()
    }

    /// Drops what is remembered about one account, so the next refresh asks
    /// again even inside the cache window.
    pub fn forget(&mut self, id: &ProbeKey) {
        self.entries.remove(id);
    }
}

/// Runs one bounded batch, each account on its own thread.
fn run(batch: &[&ProbeTarget]) -> Vec<(ProbeKey, AuthSnapshot)> {
    std::thread::scope(|scope| {
        let handles: Vec<_> = batch
            .iter()
            .map(|target| {
                (
                    *target,
                    scope.spawn(move || {
                        if installed(target.provider) {
                            probe(target.provider, &target.home)
                        } else {
                            AuthSnapshot::default()
                        }
                    }),
                )
            })
            .collect();
        handles
            .into_iter()
            .map(|(target, handle)| {
                let id = key(target.provider.id, &target.account_id);
                // A panicked probe is reported as unverifiable rather than as
                // "signed out" — the difference between those two is what the
                // row's Try again state exists to say.
                (id, handle.join().unwrap_or_else(|_| AuthSnapshot::failed()))
            })
            .collect()
    })
}
