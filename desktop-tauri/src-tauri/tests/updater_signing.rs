//! Proves the public key shipped in `tauri.conf.json` is the one whose private
//! key actually signs our releases.
//!
//! Getting this wrong is uniquely expensive: the mismatch is invisible until a
//! user has downloaded the whole package, at which point the install is
//! rejected and every client is stuck on the build it has. Nothing else in the
//! pipeline catches it — the bundle builds, the feed serves, the download
//! completes, and only the final verify fails.
//!
//! The fixture was signed with the real private key (kept outside the repo),
//! so this runs anywhere without needing that key present.

use base64::Engine;
use minisign_verify::{PublicKey, Signature};

const PAYLOAD: &[u8] = include_bytes!("fixtures/updater-fixture.bin");
const SIGNATURE: &str = include_str!("fixtures/updater-fixture.bin.sig");

/// Both the public key and the `.sig` contents are stored base64-wrapped —
/// the form `tauri signer` emits, the form the config holds, and the form the
/// update feed serves in its `signature` field.
fn unwrap_base64(encoded: &str) -> String {
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(encoded.trim())
        .expect("base64-wrapped minisign data");
    String::from_utf8(decoded).expect("minisign data decodes to text")
}

/// `plugins.updater.pubkey` is the base64 of the whole minisign `.pub` file.
fn configured_public_key() -> PublicKey {
    let config: serde_json::Value =
        serde_json::from_str(include_str!("../tauri.conf.json")).expect("tauri.conf.json parses");
    let encoded = config["plugins"]["updater"]["pubkey"]
        .as_str()
        .expect("an updater public key is configured");
    PublicKey::decode(&unwrap_base64(encoded)).expect("the configured public key is a minisign key")
}

#[test]
fn configured_public_key_verifies_a_release_signed_with_our_private_key() {
    let signature =
        Signature::decode(&unwrap_base64(SIGNATURE)).expect("the fixture signature parses");

    configured_public_key()
        .verify(PAYLOAD, &signature, false)
        .expect("the shipped public key must verify our own signature");
}

#[test]
fn a_tampered_package_is_rejected() {
    let signature =
        Signature::decode(&unwrap_base64(SIGNATURE)).expect("the fixture signature parses");
    let mut tampered = PAYLOAD.to_vec();
    tampered.push(b'!');

    assert!(
        configured_public_key()
            .verify(&tampered, &signature, false)
            .is_err(),
        "a modified package must never verify",
    );
}
