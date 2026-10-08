import { createHash, createPublicKey, verify } from "node:crypto";

// A second implementation of the check `tauri-plugin-updater` performs before
// it replaces the running app, so a release can be proven installable *before*
// it is published rather than after an installed client rejects it.
//
// Publishing an archive whose signature does not match the key baked into
// shipped builds is the one release mistake with no remote fix: every client
// downloads, fails to verify, and stays where it is — and the feed keeps
// insisting an update exists. That is worth 70 lines of duplication.

/** Tauri stores both the public key and the `.sig` file base64-encoded, so the
 * decoded text is an ordinary two-or-four-line minisign file. */
function minisignLines(base64) {
  return Buffer.from(base64.trim(), "base64").toString("utf8").split("\n");
}

/** Minisign payload: 2-byte algorithm, 8-byte key id, then the key or the
 * signature itself. */
function payload(line) {
  const bytes = Buffer.from(line.trim(), "base64");
  return {
    algorithm: bytes.subarray(0, 2).toString("utf8"),
    keyId: bytes.subarray(2, 10).toString("hex"),
    body: bytes.subarray(10),
  };
}

function readPublicKey(base64) {
  const key = payload(minisignLines(base64)[1] ?? "");
  if (key.body.length !== 32) {
    throw new Error("Public key is not a 32-byte Ed25519 key.");
  }
  return key;
}

function readSignature(base64) {
  const signature = payload(minisignLines(base64)[1] ?? "");
  if (signature.body.length !== 64) {
    throw new Error("Signature is not a 64-byte Ed25519 signature.");
  }
  return signature;
}

/** Node has no Ed25519 raw-key import, so the 32 bytes are wrapped in the
 * fixed SPKI prefix for id-Ed25519 (RFC 8410). */
function ed25519Key(raw) {
  return createPublicKey({
    key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), raw]),
    format: "der",
    type: "spki",
  });
}

/**
 * Verifies `contents` against a Tauri `.sig` and the `pubkey` from
 * tauri.conf.json. Returns nothing; throws with the reason it would fail on a
 * user's machine.
 */
export function verifyUpdateSignature(contents, signatureBase64, pubkeyBase64) {
  const key = readPublicKey(pubkeyBase64);
  const signature = readSignature(signatureBase64);

  // The likeliest real-world failure: the release was signed with a key that is
  // not the one installed clients trust, which no amount of re-uploading fixes.
  if (signature.keyId !== key.keyId) {
    throw new Error(
      `Signed with key ${signature.keyId}, but shipped builds trust ${key.keyId}. `
      + "Installed clients would reject this archive.",
    );
  }

  // "ED" is minisign's prehashed mode (BLAKE2b-512 of the file); "Ed" signs the
  // bytes directly. Tauri emits the latter, but a future signer flipping to
  // prehashed must not silently fail verification here.
  const message = signature.algorithm === "ED"
    ? createHash("blake2b512").update(contents).digest()
    : contents;

  if (!verify(null, message, ed25519Key(key.body), signature.body)) {
    throw new Error("Signature does not match the archive — the bytes or the .sig are wrong.");
  }
}
