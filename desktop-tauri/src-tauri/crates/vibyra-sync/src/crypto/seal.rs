use super::{aad, kdf, nonce, CHUNK_LEN, HEADER_LEN, MAGIC};
use crate::error::{Result, SyncError};
use chacha20poly1305::aead::{Aead, Payload};
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use x25519_dalek::{PublicKey, StaticSecret};

/// What `seal_stream` produced: the ciphertext length and its SHA-256 (the upload's `sha256`).
#[derive(Debug, Clone, PartialEq)]
pub struct Sealed {
    pub bytes: u64,
    pub sha256: String,
    pub ephemeral_public: [u8; 32],
}

/// Reads up to `buf.len()` bytes, looping over short reads; returns how many were read.
fn fill(r: &mut impl Read, buf: &mut [u8]) -> std::io::Result<usize> {
    let mut n = 0;
    while n < buf.len() {
        match r.read(&mut buf[n..]) {
            Ok(0) => break,
            Ok(k) => n += k,
            Err(e) if e.kind() == std::io::ErrorKind::Interrupted => {}
            Err(e) => return Err(e),
        }
    }
    Ok(n)
}

/// Seals `plain` to `recipient` with a fresh random ephemeral key, streaming (memory use is two chunks).
pub fn seal_stream(
    recipient: &[u8; 32],
    plain: &mut impl Read,
    out: &mut impl Write,
) -> Result<Sealed> {
    let mut secret = [0u8; 32];
    getrandom::fill(&mut secret).map_err(|e| SyncError::Io(format!("no randomness: {e}")))?;
    seal_stream_with_ephemeral(&secret, recipient, plain, out)
}

/// Same with a caller-chosen ephemeral secret. Only for test vectors: never reuse an ephemeral key.
pub fn seal_stream_with_ephemeral(
    ephemeral_secret: &[u8; 32],
    recipient: &[u8; 32],
    plain: &mut impl Read,
    out: &mut impl Write,
) -> Result<Sealed> {
    let secret = StaticSecret::from(*ephemeral_secret);
    let e_pub = PublicKey::from(&secret).to_bytes();
    let shared = secret.diffie_hellman(&PublicKey::from(*recipient));
    let cipher = kdf::cipher(shared.as_bytes(), &e_pub, recipient);
    let mut header = [0u8; HEADER_LEN];
    header[..7].copy_from_slice(MAGIC);
    header[7..].copy_from_slice(&e_pub);
    let mut hasher = Sha256::new();
    let mut total = 0u64;
    let mut emit = |bytes: &[u8]| -> Result<()> {
        hasher.update(bytes);
        total += bytes.len() as u64;
        out.write_all(bytes)?;
        Ok(())
    };
    emit(&header)?;
    // One byte of lookahead tells us whether the chunk in hand is the last.
    let mut cur = vec![0u8; CHUNK_LEN];
    let mut cur_len = fill(plain, &mut cur)?;
    let mut next = vec![0u8; CHUNK_LEN];
    let mut index = 0u64;
    loop {
        let next_len = if cur_len == CHUNK_LEN {
            fill(plain, &mut next)?
        } else {
            0
        };
        let last = next_len == 0;
        let sealed = cipher
            .encrypt(
                (&nonce(index)).into(),
                Payload {
                    msg: &cur[..cur_len],
                    aad: &aad(&header, last),
                },
            )
            .map_err(|_| SyncError::Crypto("encryption failed"))?;
        emit(&(sealed.len() as u32).to_be_bytes())?;
        emit(&sealed)?;
        if last {
            break;
        }
        std::mem::swap(&mut cur, &mut next);
        cur_len = next_len;
        index += 1;
    }
    Ok(Sealed {
        bytes: total,
        sha256: super::hex(&hasher.finalize()),
        ephemeral_public: e_pub,
    })
}

/// Convenience for small in-memory plaintexts.
pub fn seal_bytes(recipient: &[u8; 32], plain: &[u8]) -> Result<Vec<u8>> {
    let mut out = Vec::with_capacity(plain.len() + 128);
    seal_stream(recipient, &mut &plain[..], &mut out)?;
    Ok(out)
}
