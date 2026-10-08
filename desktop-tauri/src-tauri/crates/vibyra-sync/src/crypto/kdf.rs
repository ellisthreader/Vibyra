use chacha20poly1305::{ChaCha20Poly1305, KeyInit};
use hkdf::Hkdf;
use sha2::Sha256;

/// `HKDF-SHA256(ikm = shared, salt = E || R, info = "vibyra-sync-v1", len = 32)` as a cipher.
pub(crate) fn cipher(
    shared: &[u8; 32],
    e_pub: &[u8; 32],
    recipient: &[u8; 32],
) -> ChaCha20Poly1305 {
    let mut salt = [0u8; 64];
    salt[..32].copy_from_slice(e_pub);
    salt[32..].copy_from_slice(recipient);
    let mut key = [0u8; 32];
    Hkdf::<Sha256>::new(Some(&salt), shared)
        .expand(b"vibyra-sync-v1", &mut key)
        .expect("32 bytes is a valid HKDF-SHA256 length");
    ChaCha20Poly1305::new((&key).into())
}
