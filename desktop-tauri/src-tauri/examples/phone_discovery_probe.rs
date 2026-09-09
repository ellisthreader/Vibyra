//! Proves a phone can actually find this Mac: starts the embedded connection on
//! the address the app would pick, then browses with Apple's own Bonjour stack —
//! the one `NWBrowser` uses on the iPhone — and prints what it advertised.
//!
//! Runs on a scratch identity and an ephemeral port, so it never disturbs a
//! Vibyra that is already running.
use serde_json::Value;
use std::{
    net::SocketAddr,
    process::{Command, Stdio},
    sync::{mpsc::Receiver, Arc},
    thread,
    time::Duration,
};
use vibyra_host::{Backend, EmbeddedHost};

// The probe only needs the interface picker from this module.
#[allow(dead_code)]
#[path = "../src/phone/address.rs"]
mod address;

struct Idle;
impl Backend for Idle {
    fn handle(&self, _: &str, _: &str, _: Value) -> Result<Value, String> {
        Err("discovery probe serves nothing".into())
    }
    fn subscribe(&self) -> Receiver<Value> {
        std::sync::mpsc::channel().1
    }
    fn disconnected(&self, _: &str) {}
    fn pairing_notice(&self) -> &'static str {
        "Discovery probe"
    }
}

fn main() {
    let selected = address::default_address();
    let ip = address::connection_address(&selected).expect("no reachable network interface");
    let name = Command::new("hostname")
        .output()
        .ok()
        .map(|out| String::from_utf8_lossy(&out.stdout).trim().to_owned())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "Vibyra Desktop".into());
    let name = name.trim_end_matches(".local").to_owned();
    let directory = std::env::temp_dir().join("vibyra-discovery-probe");
    let _ = std::fs::remove_dir_all(&directory);
    let host = EmbeddedHost::start(directory, SocketAddr::new(ip, 0), Arc::new(Idle), &name)
        .expect("embedded connection did not start");
    println!(
        "Advertising \"{name}\" on {ip} port {}",
        host.status()["port"]
    );
    let mut browse = Command::new("dns-sd")
        .args(["-B", "_vibyra-host._tcp", "local."])
        .stdout(Stdio::piped())
        .spawn()
        .expect("dns-sd is part of macOS");
    thread::sleep(Duration::from_secs(6));
    let _ = browse.kill();
    let found = browse.wait_with_output().expect("browse output");
    let listing = String::from_utf8_lossy(&found.stdout);
    println!("{listing}");
    assert!(
        listing.contains(&name),
        "Bonjour never listed this Mac; a phone would not see it either"
    );
    println!("A phone browsing this network finds \"{name}\".");
}
