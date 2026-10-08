// These shared modules also implement the public embedded-Host API.
// Keep library checks strict; standalone omits its embedded consumers.
mod auth;
#[cfg(test)]
mod auth_tests;
#[allow(dead_code)]
mod backend;
mod config;
mod connection;
#[cfg(test)]
mod connection_confirmation_tests;
#[cfg(test)]
mod connection_queue_tests;
#[cfg(test)]
mod connection_tests;
mod console;
#[allow(dead_code)]
mod device_trust;
mod direct;
mod discovery;
mod discovery_watch;
#[allow(dead_code)]
mod identity;
mod identity_contents;
mod identity_permissions;
#[allow(dead_code)]
mod identity_policy;
mod identity_store;
mod instance;
mod invitation;
#[allow(dead_code)]
mod lan_authorization;
#[cfg(test)]
mod lan_connection_tests;
mod lan_visit;
mod peer_policy;
mod presence;
#[cfg(test)]
mod presence_tests;
#[allow(dead_code)]
mod preview_connection;
#[cfg(test)]
mod preview_connection_tests;
#[allow(dead_code)]
mod preview_upgrade;
#[allow(dead_code)]
mod relay;
mod relay_address;
mod relay_connection;
mod relay_peers;
mod relay_writer;
#[allow(dead_code)]
mod remote_authorization;
#[cfg(test)]
mod remote_connection_tests;
mod remote_permissions;
#[allow(dead_code)]
mod remote_restrictions;
#[allow(dead_code)]
mod remote_revocation;
#[cfg(test)]
mod remote_test_support;
#[allow(dead_code)]
mod restriction_apply;
mod rpc_access;
#[allow(dead_code)]
mod state;
#[cfg(test)]
mod test_support;

use clap::Parser;
use config::Config;
use std::{
    collections::{BTreeMap, HashMap},
    sync::{Arc, Mutex},
};

#[tokio::main]
async fn main() {
    if let Err(error) = start(Config::parse()).await {
        eprintln!("Vibyra Host: {error}");
        std::process::exit(1);
    }
}

async fn start(config: Config) -> Result<(), String> {
    let path = config.state_path()?;
    let _instance_lock = instance::lock(&path)?;
    let identity = identity::Identity::load(&path, config.name.as_deref())?;
    let mut projects = Vec::new();
    for path in &config.project {
        let canonical = path
            .canonicalize()
            .map_err(|e| format!("Project unavailable: {e}"))?;
        if !canonical.is_dir() {
            return Err("Projects must be directories".into());
        }
        let name = canonical
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("Project")
            .to_string();
        projects.push((name, canonical));
    }
    let engine = Arc::new(vibyra_engine::Engine::new(path, projects)?);
    for preview in &config.preview {
        let (project, port) = preview
            .rsplit_once(':')
            .ok_or("Preview must be PROJECT_NAME:PORT")?;
        engine.allow_preview(project, port.parse().map_err(|_| "Invalid preview port")?)?;
    }
    let shared = Arc::new(state::Shared {
        engine,
        policy_pending: std::sync::atomic::AtomicBool::new(identity.restrictions.is_some()),
        policy_failing_since: std::sync::atomic::AtomicU64::new(0),
        identity: Mutex::new(identity),
        writes: Mutex::new(()),
        invitation: Mutex::new(None),
        pending: Mutex::new(BTreeMap::new()),
        active: Mutex::new(HashMap::new()),
        used_remote_grants: Mutex::new(HashMap::new()),
        remote_authorizations: std::sync::Mutex::default(),
        lan_generation: std::sync::atomic::AtomicU64::new(1),
        lan_visits: std::sync::Mutex::new(Default::default()),
        policy_epoch: std::sync::atomic::AtomicU64::new(1),
        pairing_url: config.pairing_url(),
        relay: config.relay.is_some(),
        nearby: config.discover,
    });
    let listener = tokio::net::TcpListener::bind(config.listen)
        .await
        .map_err(|e| e.to_string())?;
    println!(
        "Vibyra Host listening on {}",
        listener.local_addr().map_err(|e| e.to_string())?
    );
    let address = listener.local_addr().map_err(|e| e.to_string())?;
    let (name, id) = {
        let identity = shared.identity.lock().map_err(|_| "Identity unavailable")?;
        (identity.name.clone(), identity.id())
    };
    if config.discover && address.ip().is_loopback() {
        println!("Not advertising over Bonjour: loopback listener.");
        println!("Phones that can reach {address} directly can still find this Host.");
    }
    let relay_name = name.clone();
    let announcement = async {
        if !config.discover {
            std::future::pending::<()>().await;
        }
        discovery_watch::maintain(name, id, address, Arc::new(Mutex::new(Default::default())))
            .await;
    };
    println!(
        "Host public key: {}",
        shared
            .identity
            .lock()
            .map_err(|_| "Identity unavailable")?
            .public_key
    );
    if config.pair {
        println!(
            "Pairing invitation (expires in 2 minutes):\n{}",
            shared.invite(None)?
        );
    }
    console::start(shared.clone());
    if let Some(url) = config.relay {
        let token_path = config
            .relay_token_file
            .ok_or("Provide --relay-token-file for relay access")?;
        let token =
            std::fs::read_to_string(token_path).map_err(|_| "Cannot read relay token file")?;
        let token = token.trim().to_string();
        if token.len() < 32 || token.len() > 4096 {
            return Err("Relay token must have between 32 and 4096 characters".into());
        }
        let credentials = relay::RelayCredentials {
            authorization_key: None,
            allow_unsigned_loopback: true,
            authorization_context: None,
            url,
            token,
            name: relay_name,
        };
        let source: relay::CredentialSource = Arc::new(move || {
            let credentials = credentials.clone();
            Box::pin(async move { Ok(credentials) })
        });
        // Held for the life of the process; dropping it would end the leg.
        std::mem::forget(relay::start(shared.clone(), source));
    }
    tokio::select! {
        _ = announcement => Ok(()),
        result = direct::serve_with_policy(listener, shared, true) => result,
        result = tokio::signal::ctrl_c() => result.map_err(|e| e.to_string()),
    }
}
