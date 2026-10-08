//! `VSYNC1` sealed streams (contract: docs/cloud-sync-contract.md, "Crypto").
//!
//! Output = `"VSYNC1\n" || E || chunks`; each chunk is `u32_be(len) || ChaCha20-Poly1305(ciphertext+tag)`,
//! nonce `00000000 || u64_be(i)`, AAD = the 39-byte header plus one `final` byte. A plaintext of exactly
//! 65536 bytes is ONE (final) chunk; an empty plaintext is one empty final chunk.
//!
//! `open_stream` writes plaintext chunk by chunk as each chunk authenticates, but truncation, trailing bytes
//! and a missing final chunk are only detected at the end: write to a scratch file and discard it on error.
mod kdf;
mod open;
mod seal;
pub use open::{open_bytes, open_stream, public_from_secret};
pub use seal::{seal_bytes, seal_stream, seal_stream_with_ephemeral, Sealed};

pub const MAGIC: &[u8; 7] = b"VSYNC1\n";
pub const HEADER_LEN: usize = 39;
pub const CHUNK_LEN: usize = 65536;
pub const TAG_LEN: usize = 16;

pub(crate) fn nonce(index: u64) -> [u8; 12] {
    let mut n = [0u8; 12];
    n[4..].copy_from_slice(&index.to_be_bytes());
    n
}

pub(crate) fn aad(header: &[u8; HEADER_LEN], last: bool) -> [u8; HEADER_LEN + 1] {
    let mut a = [0u8; HEADER_LEN + 1];
    a[..HEADER_LEN].copy_from_slice(header);
    a[HEADER_LEN] = u8::from(last);
    a
}

pub fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

pub fn unhex<const N: usize>(s: &str) -> Option<[u8; N]> {
    if s.len() != N * 2 || !s.is_ascii() {
        return None;
    }
    let mut out = [0u8; N];
    for (i, b) in out.iter_mut().enumerate() {
        *b = u8::from_str_radix(&s[i * 2..i * 2 + 2], 16).ok()?;
    }
    Some(out)
}
