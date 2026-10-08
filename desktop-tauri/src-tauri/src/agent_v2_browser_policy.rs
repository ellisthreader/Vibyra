//! Network policy for the Agent browser: granted origins, local-address
//! blocking after DNS, and which request methods automation may send.
//! Enforced twice: by the filtering proxy (every connection Chrome makes,
//! including redirects, popups, workers and subresources) and by CDP Fetch
//! interception (methods, file:// and exact URLs). Pure except DNS.

use std::collections::{HashMap, HashSet};
use std::net::{IpAddr, SocketAddr, ToSocketAddrs};
use std::sync::Mutex;

pub use super::address::{local_address, origin_of};
use super::sent::SentLog;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Mode {
    /// The model drives: only safe methods (GET/HEAD/OPTIONS).
    Auto,
    /// An approved submit is in flight: unsafe methods only to this origin.
    Submit,
    /// The person drives the visible window (sign-in): any method, granted origins only.
    Takeover,
}

pub struct Policy {
    origins: Mutex<HashSet<String>>,
    mode: Mutex<(Mode, Option<String>)>,
    blocked: Mutex<Vec<String>>,
    /// What the browser sent (and how the site answered) during an approved submit.
    pub sent: SentLog,
    /// Test-only name overrides: host → (addresses, exempt from the local-address rule).
    hosts: HashMap<String, (Vec<IpAddr>, bool)>,
}

impl Policy {
    pub fn new(origins: &[String]) -> Self {
        Policy {
            origins: Mutex::new(origins.iter().filter_map(|o| origin_of(o)).collect()),
            mode: Mutex::new((Mode::Auto, None)),
            blocked: Mutex::new(Vec::new()),
            sent: SentLog::default(),
            hosts: HashMap::new(),
        }
    }

    #[cfg(test)]
    pub fn with_hosts(mut self, hosts: HashMap<String, (Vec<IpAddr>, bool)>) -> Self {
        self.hosts = hosts;
        self
    }

    pub fn set_origins(&self, origins: &[String]) {
        *self.origins.lock().unwrap() = origins.iter().filter_map(|o| origin_of(o)).collect();
    }

    pub fn allows_origin(&self, origin: &str) -> bool {
        self.origins.lock().unwrap().contains(origin)
    }

    pub fn allows_url(&self, url: &str) -> bool {
        origin_of(url).is_some_and(|o| self.allows_origin(&o))
    }

    pub fn set_mode(&self, mode: Mode, submit_origin: Option<String>) {
        *self.mode.lock().unwrap() = (mode, submit_origin);
    }

    pub fn mode(&self) -> Mode {
        self.mode.lock().unwrap().0
    }

    pub fn note_blocked(&self, what: String) {
        let mut list = self.blocked.lock().unwrap();
        if list.len() < 20 && !list.contains(&what) {
            list.push(what);
        }
    }

    pub fn take_blocked(&self) -> Vec<String> {
        std::mem::take(&mut *self.blocked.lock().unwrap())
    }

    /// Fetch interception: `Ok` to continue, `Err(reason)` to fail the request.
    pub fn request(&self, url: &str, method: &str) -> Result<(), &'static str> {
        if url.starts_with("data:") || url.starts_with("blob:") || url == "about:blank" {
            return Ok(());
        }
        let Some(origin) = origin_of(url) else {
            // Page-controlled text reaches the model: keep only a short, plain scheme name.
            let scheme: String = url
                .split(':')
                .next()
                .unwrap_or("?")
                .chars()
                .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '.' | '-'))
                .take(16)
                .collect();
            self.note_blocked(format!("{scheme} (not a web address)"));
            return Err("scheme");
        };
        // Sockets send data Fetch cannot gate; the page guard removes them, this is the backstop.
        let socket = url.starts_with("ws:") || url.starts_with("wss:");
        if socket && self.mode() != Mode::Takeover {
            self.note_blocked(format!(
                "a live connection to {origin} (messages cannot be approved)"
            ));
            return Err("socket");
        }
        if !self.allows_origin(&origin) {
            self.note_blocked(format!("{origin} (not an allowed site)"));
            return Err("origin");
        }
        let safe = matches!(method, "GET" | "HEAD" | "OPTIONS");
        let (mode, submit) = self.mode.lock().unwrap().clone();
        let allowed = safe
            || mode == Mode::Takeover
            || (mode == Mode::Submit && submit.as_deref() == Some(origin.as_str()));
        if !allowed {
            self.note_blocked(format!(
                "{method} to {origin} (sending data needs browser_submit)"
            ));
            return Err("method");
        }
        Ok(())
    }

    /// Proxy: may Chrome connect to `host:port`? Scheme is unknown for CONNECT.
    pub fn allows_host(&self, host: &str, port: u16, schemes: &[&str]) -> bool {
        let host = host
            .trim_matches(|c| c == '[' || c == ']')
            .to_ascii_lowercase();
        schemes.iter().any(|scheme| {
            let default = if *scheme == "https" { 443 } else { 80 };
            let origin = match port == default {
                true => format!("{scheme}://{host}"),
                false => format!("{scheme}://{host}:{port}"),
            };
            self.allows_origin(&origin)
        })
    }

    /// Resolves once and refuses any local address, so the proxy connects to
    /// exactly the vetted address (no DNS rebinding between check and use).
    pub fn resolve(&self, host: &str, port: u16) -> Result<Vec<SocketAddr>, String> {
        let bare = host
            .trim_matches(|c| c == '[' || c == ']')
            .to_ascii_lowercase();
        let (addrs, exempt) = match self.hosts.get(&bare) {
            Some((ips, exempt)) => (
                ips.iter().map(|ip| SocketAddr::new(*ip, port)).collect(),
                *exempt,
            ),
            None if !self.hosts.is_empty() => return Err(format!("{bare} does not resolve")),
            None => (
                (bare.as_str(), port)
                    .to_socket_addrs()
                    .map_err(|_| format!("{bare} does not resolve"))?
                    .collect::<Vec<_>>(),
                false,
            ),
        };
        if addrs.is_empty() {
            return Err(format!("{bare} does not resolve"));
        }
        if !exempt && addrs.iter().any(|a| local_address(a.ip())) {
            self.note_blocked(format!("{bare} (local or private network address)"));
            return Err(format!(
                "{bare} points at a local or private network address"
            ));
        }
        Ok(addrs)
    }
}

/// A refusal the receipt reports as `{error, reason, unknown?}`.
#[derive(Debug)]
pub struct Refusal {
    pub reason: &'static str,
    pub message: String,
    pub unknown: bool,
}

pub fn refuse(reason: &'static str, message: impl Into<String>) -> Refusal {
    Refusal {
        reason,
        message: message.into(),
        unknown: false,
    }
}

impl From<String> for Refusal {
    fn from(message: String) -> Self {
        refuse("unavailable", message)
    }
}

#[cfg(test)]
#[path = "agent_v2_browser_policy_tests.rs"]
mod tests;
