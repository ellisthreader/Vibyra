mod auth;
#[cfg(test)]
mod auth_tests;
mod config;
mod connection;
#[cfg(test)]
mod connection_tests;
mod console;
mod direct;
mod identity;
mod instance;
mod invitation;
mod relay;
mod state;
#[cfg(test)]
mod test_support;

use clap::Parser;
use config::Config;
use std::{
    collections::{BTreeMap, HashSet},
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
        identity: Mutex::new(identity),
        invitation: Mutex::new(None),
        pending: Mutex::new(BTreeMap::new()),
        active: Mutex::new(HashSet::new()),
        pairing_url: config.pairing_url(),
        relay: config.relay.is_some(),
    });
    let listener = tokio::net::TcpListener::bind(config.listen)
        .await
        .map_err(|e| e.to_string())?;
    println!(
        "Vibyra Host listening on {}",
        listener.local_addr().map_err(|e| e.to_string())?
    );
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
        tokio::spawn(relay::maintain(shared.clone(), url, token));
    }
    tokio::select! {
        result = direct::serve(listener, shared) => result,
        result = tokio::signal::ctrl_c() => result.map_err(|e| e.to_string()),
    }
}
