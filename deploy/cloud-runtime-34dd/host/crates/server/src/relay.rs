//! Outbound Vibyra Cloud leg: relay envelopes carry the same authenticated
//! Noise phone connection, trust and approval flow used on the LAN.
use crate::state::Shared;
use futures_util::future::BoxFuture;
use std::{
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::sync::Notify;

/// Where to connect and what to say: fetched fresh before every attempt, so a
/// token that expired while the computer was offline is never presented.
#[derive(Clone, Debug)]
pub struct RelayCredentials {
    pub url: String,
    pub token: String,
    pub name: String,
    /// Public verification key delivered by the account API over HTTPS.
    pub authorization_key: Option<String>,
    /// Explicit diagnostics only; never set by the Desktop account API.
    pub allow_unsigned_loopback: bool,
    pub authorization_context: Option<crate::remote_authorization::AuthorizationContext>,
}
pub type CredentialSource =
    Arc<dyn Fn() -> BoxFuture<'static, Result<RelayCredentials, String>> + Send + Sync>;

#[derive(Clone, Debug, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayStatus {
    /// `waiting`, `connecting`, `online` or `error`.
    pub state: String,
    pub error: Option<String>,
    pub clients: usize,
    pub relay: Option<String>,
}

/// Dropping the leg ends its relay connection and every phone on it.
#[cfg_attr(not(test), allow(dead_code))]
pub struct RelayHandle {
    status: Arc<Mutex<RelayStatus>>,
    drop_all: Arc<Notify>,
    task: tokio::task::JoinHandle<()>,
}
#[cfg_attr(not(test), allow(dead_code))]
impl RelayHandle {
    pub fn status(&self) -> RelayStatus {
        self.status.lock().map(|s| s.clone()).unwrap_or_default()
    }
    /// Ends every phone's session through the relay now; the relay connection
    /// itself stays, so the computer remains reachable.
    pub fn disconnect_all(&self) {
        self.drop_all.notify_one();
    }
}
impl Drop for RelayHandle {
    fn drop(&mut self) {
        self.task.abort();
    }
}

/// Starts the leg on the current runtime.
pub fn start(shared: Arc<Shared>, source: CredentialSource) -> RelayHandle {
    let status = Arc::new(Mutex::new(RelayStatus {
        state: "connecting".into(),
        ..Default::default()
    }));
    let drop_all = Arc::new(Notify::new());
    let task = tokio::spawn(maintain(shared, source, status.clone(), drop_all.clone()));
    RelayHandle {
        status,
        drop_all,
        task,
    }
}
pub(super) fn report(
    status: &Arc<Mutex<RelayStatus>>,
    state: &str,
    error: Option<String>,
    clients: usize,
) {
    if let Ok(mut current) = status.lock() {
        current.state = state.into();
        current.error = error;
        current.clients = clients;
    }
}

async fn maintain(
    shared: Arc<Shared>,
    source: CredentialSource,
    status: Arc<Mutex<RelayStatus>>,
    drop_all: Arc<Notify>,
) {
    let mut delay = 1;
    let mut last_logged: Option<String> = None;
    loop {
        let started = tokio::time::Instant::now();
        let outcome = match source().await {
            Ok(credentials) => {
                if let Ok(mut current) = status.lock() {
                    current.relay = Some(credentials.url.clone());
                }
                report(&status, "connecting", None, 0);
                crate::relay_connection::connect(&shared, credentials, &status, &drop_all).await
            }
            // Nothing to connect with yet: signed out, or the API could not be
            // reached. Said as waiting, because it is not this leg's failure.
            Err(reason) => {
                report(&status, "waiting", Some(reason.clone()), 0);
                Err(reason)
            }
        };
        if let Err(error) = outcome {
            // Headless Hosts (the cloud computer) have no UI showing the status,
            // so say each new reason once on stderr. Errors here never hold tokens.
            if last_logged.as_deref() != Some(error.as_str()) {
                eprintln!("Relay unavailable: {error}");
                last_logged = Some(error.clone());
            }
            if status.lock().map(|s| s.state != "waiting").unwrap_or(true) {
                report(&status, "error", Some(error), 0);
            }
        } else {
            last_logged = None;
        }
        if started.elapsed() > Duration::from_secs(60) {
            delay = 1;
        }
        tokio::time::sleep(Duration::from_secs(delay)).await;
        delay = (delay * 2).min(30);
    }
}
