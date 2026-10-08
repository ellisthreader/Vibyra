use super::{aad, kdf, nonce, CHUNK_LEN, HEADER_LEN, MAGIC, TAG_LEN};
use crate::error::{Result, SyncError};
use chacha20poly1305::aead::{Aead, Payload};
use std::io::{Read, Write};
use x25519_dalek::{PublicKey, StaticSecret};

/// The public key (R) for a secret key.
pub fn public_from_secret(secret: &[u8; 32]) -> [u8; 32] {
    PublicKey::from(&StaticSecret::from(*secret)).to_bytes()
}

/// Reads exactly `buf.len()` bytes; `Ok(false)` on a clean EOF before the first byte, error on a short read.
fn read_exact_or_eof<R: Read + ?Sized>(r: &mut R, buf: &mut [u8]) -> Result<bool> {
    let mut n = 0;
    while n < buf.len() {
        match r.read(&mut buf[n..]) {
            Ok(0) if n == 0 => return Ok(false),
            Ok(0) => return Err(SyncError::Crypto("truncated chunk")),
            Ok(k) => n += k,
            Err(e) if e.kind() == std::io::ErrorKind::Interrupted => {}
            Err(e) => return Err(e.into()),
        }
    }
    Ok(true)
}

/// Opens a `VSYNC1` stream with the recipient's secret key and writes the plaintext. Rejects wrong magic,
/// oversize chunks, a missing final chunk, trailing bytes and any failed tag. Returns the plaintext length.
pub fn open_stream(secret: &[u8; 32], sealed: &mut impl Read, out: &mut impl Write) -> Result<u64> {
    let mut header = [0u8; HEADER_LEN];
    if !read_exact_or_eof(sealed, &mut header)? {
        return Err(SyncError::Crypto("empty stream"));
    }
    if &header[..7] != MAGIC {
        return Err(SyncError::Crypto("wrong magic"));
    }
    let mut e_pub = [0u8; 32];
    e_pub.copy_from_slice(&header[7..]);
    let recipient = StaticSecret::from(*secret);
    let r_pub = PublicKey::from(&recipient).to_bytes();
    let shared = recipient.diffie_hellman(&PublicKey::from(e_pub));
    let cipher = kdf::cipher(shared.as_bytes(), &e_pub, &r_pub);

    let read_len = |sealed: &mut dyn Read| -> Result<Option<usize>> {
        let mut len = [0u8; 4];
        if !read_exact_or_eof(&mut *sealed, &mut len)? {
            return Ok(None);
        }
        let len = u32::from_be_bytes(len) as usize;
        if len > CHUNK_LEN + TAG_LEN {
            return Err(SyncError::Crypto("chunk too large"));
        }
        if len < TAG_LEN {
            return Err(SyncError::Crypto("chunk too small"));
        }
        Ok(Some(len))
    };
    let mut next = read_len(sealed)?.ok_or(SyncError::Crypto("missing final chunk"))?;
    let mut index = 0u64;
    let mut total = 0u64;
    loop {
        let mut chunk = vec![0u8; next];
        if !read_exact_or_eof(sealed, &mut chunk)? {
            return Err(SyncError::Crypto("truncated chunk"));
        }
        // The next length prefix (or EOF) decides whether this chunk claims to be the last.
        let following = read_len(sealed)?;
        let last = following.is_none();
        let plain = cipher
            .decrypt(
                (&nonce(index)).into(),
                Payload {
                    msg: &chunk,
                    aad: &aad(&header, last),
                },
            )
            .map_err(|_| SyncError::Crypto("authentication failed"))?;
        out.write_all(&plain)?;
        total += plain.len() as u64;
        match following {
            Some(len) => next = len,
            None => return Ok(total),
        }
        index += 1;
    }
}

/// Convenience for small in-memory streams.
pub fn open_bytes(secret: &[u8; 32], sealed: &[u8]) -> Result<Vec<u8>> {
    let mut out = Vec::new();
    open_stream(secret, &mut &sealed[..], &mut out)?;
    Ok(out)
}
