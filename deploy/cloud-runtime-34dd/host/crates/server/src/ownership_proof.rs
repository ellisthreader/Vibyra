//! Answering an account ownership challenge with the Host's own Noise key.
//! Shared by the Desktop registration proof and the headless account mode.
use crate::state::Shared;
use base64::{engine::general_purpose::STANDARD, Engine};
use crypto_box::SecretKey;

/// Accept only an 80-byte sealed 32-byte challenge, never arbitrary files or
/// a caller-selected key.
pub(crate) fn answer(shared: &Shared, ciphertext: &str) -> Result<String, String> {
    if ciphertext.len() > 112 {
        return Err("Invalid computer ownership challenge".into());
    }
    let sealed = STANDARD
        .decode(ciphertext)
        .map_err(|_| "Invalid computer ownership challenge")?;
    let identity = shared
        .identity
        .lock()
        .map_err(|_| "Computer identity unavailable")?;
    let mut private = [0u8; 32];
    hex::decode_to_slice(&identity.private_key, &mut private)
        .map_err(|_| "Computer identity unavailable")?;
    let key = SecretKey::from(private);
    private.fill(0);
    unseal(&key, &sealed)
}

pub(crate) fn unseal(key: &SecretKey, sealed: &[u8]) -> Result<String, String> {
    if sealed.len() != 80 {
        return Err("Invalid computer ownership challenge".into());
    }
    let mut proof = key
        .unseal(sealed)
        .map_err(|_| "Computer ownership challenge could not be verified")?;
    if proof.len() != 32 {
        return Err("Invalid computer ownership challenge".into());
    }
    let encoded = STANDARD.encode(&proof);
    proof.fill(0);
    Ok(encoded)
}
