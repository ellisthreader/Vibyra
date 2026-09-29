//! Libsodium-compatible sealed challenges prove possession of the existing
//! Noise X25519 key. Backend challenge state supplies scope, expiry and replay
//! protection; decrypting a nonce alone never grants access.
use crypto_box::SecretKey;

#[cfg_attr(target_arch = "wasm32", wasm_bindgen::prelude::wasm_bindgen(js_name = devicePublicKey))]
pub fn device_public_key(private_key: &[u8]) -> Result<Vec<u8>, String> {
    let key = SecretKey::from_slice(private_key).map_err(|_| "Invalid device key")?;
    Ok(key.public_key().as_bytes().to_vec())
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen::prelude::wasm_bindgen(js_name = answerChallenge))]
pub fn answer_challenge(private_key: &[u8], ciphertext: &[u8]) -> Result<Vec<u8>, String> {
    if ciphertext.len() != 80 {
        return Err("Invalid device challenge".into());
    }
    let key = SecretKey::from_slice(private_key).map_err(|_| "Invalid device key")?;
    let answer = key.unseal(ciphertext).map_err(|_| "Device challenge could not be verified")?;
    if answer.len() != 32 {
        return Err("Invalid device challenge".into());
    }
    Ok(answer)
}
