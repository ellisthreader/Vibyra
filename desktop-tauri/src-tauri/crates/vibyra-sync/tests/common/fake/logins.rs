#![allow(dead_code)]
//! The fake's login endpoints: `PUT/DELETE /login/codex` and the `logins` block of `GET /`.
use super::routes::{err, reply};
use super::FakeState;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use tiny_http::Request;
use vibyra_sync::crypto::{hex, public_from_secret};

#[derive(Default)]
pub struct LoginFake {
    pub seq: u64,
    pub applied_seq: u64,
    /// The newest un-applied blob, as the backend keeps it until the VM acks.
    pub pending: Option<Vec<u8>>,
    /// Every accepted upload `(seq, sealed)`, for assertions.
    pub puts: Vec<(u64, Vec<u8>)>,
    pub deletes: u32,
    /// The `origin` query of every accepted upload (`cloud` = a login made for Vibyra Cloud).
    pub origins: Vec<Option<String>>,
    /// Answer the next PUT with 413 `too_large`.
    pub too_large: bool,
    /// Bump the seq behind the client's back on the next PUT (another Mac won): 409 `seq_conflict`.
    pub conflict_once: bool,
    pub conflicts_remaining: u32,
    pub key_on_put: Option<Option<String>>,
    pub key_on_conflict: Option<Option<String>>,
    pub target_keys: Vec<Option<String>>,
}

fn one(l: &LoginFake) -> Value {
    json!({"seq": l.seq, "appliedSeq": l.applied_seq, "pending": l.pending.is_some(), "appliedAt": null, "origin": l.origins.last().cloned().flatten()})
}

pub fn state_json(l: &LoginFake) -> Value {
    json!({"codex": one(l)})
}

pub fn both_json(codex: &LoginFake, claude: &LoginFake) -> Value {
    json!({"codex": one(codex), "claude": one(claude)})
}

pub fn put(
    s: &mut FakeState,
    rq: Request,
    q: &BTreeMap<String, String>,
    body: Vec<u8>,
    provider: &str,
) {
    let seq = q
        .get("seq")
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(0);
    if q.get("sha256").map(String::as_str) != Some(hex(&Sha256::digest(&body)).as_str()) {
        return err(rq, 422, "sha_mismatch", json!({}));
    }
    let l = if provider == "claude" {
        &mut s.claude_login
    } else {
        &mut s.login
    };
    if std::mem::take(&mut l.too_large) || body.len() > 256 * 1024 {
        return err(rq, 413, "too_large", json!({}));
    }
    if let Some(key) = l.key_on_put.take() {
        s.vm_key_published = key.is_some();
        s.vm_key_override = key;
    }
    if std::mem::take(&mut l.conflict_once) || l.conflicts_remaining > 0 {
        l.conflicts_remaining = l.conflicts_remaining.saturating_sub(1);
        l.seq += 1;
        if let Some(key) = l.key_on_conflict.take() {
            s.vm_key_published = key.is_some();
            s.vm_key_override = key;
        }
    }
    if seq <= l.seq {
        return err(rq, 409, "seq_conflict", json!({"expected": l.seq + 1}));
    }
    let current = s.vm_key_published.then(|| {
        s.vm_key_override
            .clone()
            .unwrap_or_else(|| hex(&public_from_secret(&super::VM_SECRET)))
    });
    if q.get("targetVmKey")
        .is_some_and(|expected| current.as_ref() != Some(expected))
    {
        return err(rq, 409, "vm_key_changed", json!({}));
    }
    l.target_keys.push(q.get("targetVmKey").cloned());
    l.seq = seq;
    l.pending = Some(body.clone());
    l.puts.push((seq, body));
    l.origins.push(q.get("origin").cloned());
    reply(rq, 200, json!({"ok": true, "login": one(l)}));
}

pub fn delete(s: &mut FakeState, rq: Request, q: &BTreeMap<String, String>) {
    let expected = q.get("expectedSeq").and_then(|v| v.parse::<u64>().ok());
    if s.login.origins.last().cloned().flatten().as_deref() == Some("cloud")
        || expected.is_some_and(|seq| seq != s.login.seq)
    {
        return reply(rq, 200, json!({"ok": true}));
    }
    s.login.pending = None;
    s.login.deletes += 1;
    reply(rq, 200, json!({"ok": true}));
}
