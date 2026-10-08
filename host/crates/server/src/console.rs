use crate::state::Shared;
use std::{
    io::{self, BufRead},
    sync::Arc,
};

pub fn start(shared: Arc<Shared>) {
    std::thread::spawn(move || {
        println!("Local commands: pair [URL], devices, approve KEY, deny KEY, revoke KEY");
        for line in io::stdin().lock().lines() {
            let Ok(line) = line else { break };
            let mut parts = line.split_whitespace();
            let result = match (parts.next(), parts.next()) {
                (Some("pair"), url) => shared
                    .invite(url)
                    .map(|uri| println!("Pairing invitation (expires in 2 minutes):\n{uri}")),
                (Some("devices"), _) => shared
                    .identity
                    .lock()
                    .map_err(|_| "Identity unavailable".to_string())
                    .map(|identity| {
                        for device in identity.devices.values() {
                            println!("{}  {}", device.id, device.name);
                        }
                    }),
                (Some("approve"), Some(id)) => shared.answer(id, true),
                (Some("deny"), Some(id)) => shared.answer(id, false),
                (Some("revoke"), Some(id)) => shared.revoke(id),
                (None, _) => Ok(()),
                _ => Err("Use pair [URL], devices, approve KEY, deny KEY, or revoke KEY".into()),
            };
            if let Err(error) = result {
                eprintln!("{error}");
            }
        }
    });
}
