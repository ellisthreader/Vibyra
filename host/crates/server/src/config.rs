use clap::Parser;
use std::{net::SocketAddr, path::PathBuf};

#[derive(Parser)]
#[command(name = "vibyra-host", about = "Run Vibyra terminals on this computer")]
pub struct Config {
    #[arg(long, default_value = "127.0.0.1:4318")]
    pub listen: SocketAddr,
    /// Pairing address reachable by your phone, e.g. ws://192.168.1.4:4318.
    #[arg(long)]
    pub public_url: Option<String>,
    #[arg(long)]
    pub name: Option<String>,
    #[arg(long)]
    pub state_dir: Option<PathBuf>,
    /// Explicitly expose a project directory. Repeat for multiple projects.
    #[arg(long, required = true)]
    pub project: Vec<PathBuf>,
    /// Locally allow a project preview port, formatted PROJECT_NAME:PORT.
    #[arg(long)]
    pub preview: Vec<String>,
    #[arg(long)]
    pub relay: Option<String>,
    #[arg(long, requires = "relay")]
    pub relay_token_file: Option<PathBuf>,
    /// Show a fresh, single-use two-minute pairing invitation at startup.
    #[arg(long)]
    pub pair: bool,
    /// Let nearby phones find this Host using Bonjour. Requires a LAN listener.
    #[arg(long)]
    pub discover: bool,
}

impl Config {
    pub fn state_path(&self) -> Result<PathBuf, String> {
        self.state_dir
            .clone()
            .or_else(|| dirs::data_local_dir().map(|p| p.join("vibyra-host")))
            .ok_or("No user state directory available; provide --state-dir".into())
    }

    pub fn pairing_url(&self) -> String {
        self.relay
            .clone()
            .or_else(|| self.public_url.clone())
            .unwrap_or_else(|| format!("ws://{}", self.listen))
    }
}
