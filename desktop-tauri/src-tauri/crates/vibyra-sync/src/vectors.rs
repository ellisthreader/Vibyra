//! Deterministic `VSYNC1` test vectors (`docs/cloud-sync-vectors.json`), generated here and consumed by the
//! Node VM worker. Plaintext byte `i` is `(i * 31 + 7) mod 256`; the ephemeral key is fixed, which is only
//! ever done for vectors.
use crate::crypto::{hex, open_bytes, public_from_secret, seal_stream_with_ephemeral, unhex};
use crate::error::{Result, SyncError};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

pub const LENGTHS: [(&str, usize); 6] = [
    ("empty", 0),
    ("one_byte", 1),
    ("chunk_exact_65536", 65536),
    ("chunk_plus_one_65537", 65537),
    ("multi_chunk_200000", 200000),
    ("thirteen_bytes", 13),
];

fn key(label: &str) -> [u8; 32] {
    Sha256::digest(label.as_bytes()).into()
}

pub fn plaintext(len: usize) -> Vec<u8> {
    (0..len).map(|i| ((i * 31 + 7) % 256) as u8).collect()
}

fn sha(bytes: &[u8]) -> String {
    hex(&Sha256::digest(bytes))
}

fn seal(plain: &[u8]) -> Vec<u8> {
    let mut out = vec![];
    let (e, r) = (
        key("vibyra-sync-vector-ephemeral"),
        public_from_secret(&key("vibyra-sync-vector-recipient")),
    );
    seal_stream_with_ephemeral(&e, &r, &mut &plain[..], &mut out).expect("sealing in memory");
    out
}

/// Splits a sealed stream after the header into its length-prefixed chunks.
fn chunks(sealed: &[u8]) -> Vec<&[u8]> {
    let (mut at, mut out) = (39, vec![]);
    while at < sealed.len() {
        let len = u32::from_be_bytes(sealed[at..at + 4].try_into().unwrap()) as usize;
        out.push(&sealed[at..at + 4 + len]);
        at += 4 + len;
    }
    out
}

/// The reject cases built from `sealed` (a one-chunk stream): `(name, description, mutated stream)`.
fn mutations(sealed: &[u8]) -> Vec<(&'static str, &'static str, Vec<u8>)> {
    let mut v = vec![];
    let mut m = sealed.to_vec();
    m[0] = b'X';
    v.push(("wrong_magic", "first byte changed to 'X'", m));
    let mut m = sealed.to_vec();
    *m.last_mut().unwrap() ^= 1;
    v.push(("flipped_tag_byte", "last byte flipped", m));
    let mut m = sealed.to_vec();
    m[39 + 4] ^= 1;
    v.push((
        "flipped_ciphertext_byte",
        "first ciphertext byte flipped",
        m,
    ));
    v.push((
        "truncated_header",
        "cut after 38 bytes",
        sealed[..38].to_vec(),
    ));
    v.push((
        "truncated_chunk",
        "last byte removed",
        sealed[..sealed.len() - 1].to_vec(),
    ));
    let mut m = sealed.to_vec();
    m.push(0);
    v.push(("trailing_byte", "one 0x00 byte appended", m));
    let mut m = sealed.to_vec();
    m.extend_from_slice(&sealed[39..]);
    v.push(("trailing_chunk", "the final chunk repeated after itself", m));
    let mut m = sealed.to_vec();
    m[39..43].copy_from_slice(&(65536u32 + 17).to_be_bytes());
    v.push((
        "oversize_chunk_length",
        "first chunk length set to 65553",
        m,
    ));
    v.push((
        "header_only",
        "header with no chunks",
        sealed[..39].to_vec(),
    ));
    v
}

pub fn generate() -> Value {
    let (r_secret, e_secret) = (
        key("vibyra-sync-vector-recipient"),
        key("vibyra-sync-vector-ephemeral"),
    );
    let cases: Vec<Value> = LENGTHS
        .iter()
        .map(|(name, len)| {
            let plain = plaintext(*len);
            let sealed = seal(&plain);
            let mut c = json!({ "name": name, "plaintextLength": len, "plaintextSha256": sha(&plain), "sealedLength": sealed.len(), "sealedSha256": sha(&sealed) });
            if sealed.len() <= 200 {
                c["sealedHex"] = json!(hex(&sealed));
            }
            c
        })
        .collect();
    let base = seal(&plaintext(1));
    let reject: Vec<Value> = mutations(&base)
        .into_iter()
        .map(|(name, what, bytes)| json!({ "name": name, "mutation": what, "of": "one_byte", "sealedHex": hex(&bytes) }))
        .collect();
    json!({
        "version": 1,
        "format": "VSYNC1",
        "about": "Seal with the fixed ephemeral secret, compare sealedLength/sealedSha256 (and sealedHex when present); open sealedHex with the recipient secret and compare plaintextSha256. Plaintext byte i = (i*31+7) mod 256. A plaintext of exactly 65536 bytes is one final chunk (no trailing empty chunk). Every `reject` stream and the two `rejectDerived` ones must fail to open.",
        "recipientSecretHex": hex(&r_secret),
        "recipientPublicHex": hex(&public_from_secret(&r_secret)),
        "ephemeralSecretHex": hex(&e_secret),
        "ephemeralPublicHex": hex(&public_from_secret(&e_secret)),
        "plaintextPattern": { "byteAt": "(i * 31 + 7) mod 256" },
        "cases": cases,
        "reject": reject,
        "rejectDerived": [
            { "name": "missing_final_chunk", "of": "chunk_plus_one_65537", "mutation": "drop the last chunk (header + first chunk only)" },
            { "name": "wrong_recipient_key", "of": "one_byte", "mutation": "open with any secret other than recipientSecretHex" }
        ],
    })
}

/// Verifies a vectors document against this implementation.
pub fn check(doc: &Value) -> Result<()> {
    let bad = |m: String| SyncError::Invalid(format!("vector mismatch: {m}"));
    let s = |v: &Value, k: &str| {
        v.get(k)
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string()
    };
    let r_secret: [u8; 32] =
        unhex(&s(doc, "recipientSecretHex")).ok_or_else(|| bad("recipient key".into()))?;
    let e_secret: [u8; 32] =
        unhex(&s(doc, "ephemeralSecretHex")).ok_or_else(|| bad("ephemeral key".into()))?;
    let r_pub = public_from_secret(&r_secret);
    for c in doc["cases"]
        .as_array()
        .ok_or_else(|| bad("no cases".into()))?
    {
        let name = s(c, "name");
        let len = c["plaintextLength"].as_u64().unwrap_or(0) as usize;
        let plain = plaintext(len);
        let mut sealed = vec![];
        seal_stream_with_ephemeral(&e_secret, &r_pub, &mut &plain[..], &mut sealed)?;
        if sha(&sealed) != s(c, "sealedSha256")
            || sealed.len() as u64 != c["sealedLength"].as_u64().unwrap_or(0)
        {
            return Err(bad(format!("{name}: sealed stream differs")));
        }
        if let Some(h) = c.get("sealedHex").and_then(Value::as_str) {
            if h != hex(&sealed) {
                return Err(bad(format!("{name}: sealedHex differs")));
            }
        }
        if sha(&open_bytes(&r_secret, &sealed)?) != s(c, "plaintextSha256") {
            return Err(bad(format!("{name}: plaintext differs")));
        }
    }
    for r in doc["reject"]
        .as_array()
        .ok_or_else(|| bad("no reject cases".into()))?
    {
        let bytes = r["sealedHex"].as_str().unwrap_or_default();
        let raw: Vec<u8> = (0..bytes.len() / 2)
            .map(|i| u8::from_str_radix(&bytes[i * 2..i * 2 + 2], 16).unwrap_or(0))
            .collect();
        if open_bytes(&r_secret, &raw).is_ok() {
            return Err(bad(format!("{} was accepted", s(r, "name"))));
        }
    }
    let big = seal(&plaintext(65537));
    let c = chunks(&big);
    let dropped: Vec<u8> = big[..39].iter().chain(c[0].iter()).copied().collect();
    if open_bytes(&r_secret, &dropped).is_ok() {
        return Err(bad("missing_final_chunk was accepted".into()));
    }
    if open_bytes(&key("some other recipient"), &seal(&plaintext(1))).is_ok() {
        return Err(bad("wrong recipient key was accepted".into()));
    }
    Ok(())
}
