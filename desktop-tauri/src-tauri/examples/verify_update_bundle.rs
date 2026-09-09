//! Verify a downloaded updater archive with the same verifier and key as Vibyra.
use base64::Engine;
use minisign_verify::{PublicKey, Signature};

fn decode(value: &str) -> Result<String, Box<dyn std::error::Error>> {
    Ok(String::from_utf8(
        base64::engine::general_purpose::STANDARD.decode(value.trim())?,
    )?)
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    if args.len() != 2 {
        return Err("Usage: verify_update_bundle <archive> <signature-file>".into());
    }
    let config: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json"))?;
    let encoded = config["plugins"]["updater"]["pubkey"]
        .as_str()
        .ok_or("No configured updater public key")?;
    let key = PublicKey::decode(&decode(encoded)?)?;
    let signature = Signature::decode(&decode(&std::fs::read_to_string(&args[1])?)?)?;
    let size = std::fs::metadata(&args[0])?.len();
    if size == 0 || size > 512 * 1024 * 1024 {
        return Err("Updater artifact must be nonempty and at most 512 MiB".into());
    }
    key.verify(&std::fs::read(&args[0])?, &signature, false)?;
    println!(
        "Verified {} ({size} bytes) with Vibyra's configured updater key",
        args[0]
    );
    Ok(())
}
