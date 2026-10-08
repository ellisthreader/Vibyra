use super::uploads::put_up;
use super::{FakeState, P, TOKEN, VM_SECRET};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};
use tiny_http::{Header, Method, Request, Response};
use vibyra_sync::crypto::{hex, public_from_secret};

pub(super) fn project_json(p: &P) -> Value {
    let state = if p.skipped.is_some() {
        "skipped"
    } else if p.up_seq > p.applied_seq {
        "pending"
    } else {
        "synced"
    };
    json!({"name": p.name, "projectKey": p.key, "upSeq": p.up_seq, "upHead": p.up_head, "upSyncedAt": null, "upAppliedSeq": p.applied_seq,
        "appliedAt": null, "state": state, "reason": p.skipped, "resync": p.resync, "cloudSeq": 0, "cloudHead": null, "cloudAt": null,
        "transcriptsSeq": p.transcripts_seq, "transcriptsAppliedSeq": p.transcripts_seq, "bytes": 0})
}

pub(super) fn reply(rq: Request, code: u16, body: Value) {
    let h = Header::from_bytes("Content-Type", "application/json").unwrap();
    let _ = rq.respond(
        Response::from_string(body.to_string())
            .with_status_code(code)
            .with_header(h),
    );
}

pub(super) fn err(rq: Request, code: u16, c: &str, extra: Value) {
    let mut v = json!({"ok": false, "code": c, "message": format!("fake: {c}"), "error": format!("fake: {c}")});
    if let (Some(o), Some(e)) = (v.as_object_mut(), extra.as_object()) {
        o.extend(e.clone());
    }
    reply(rq, code, v);
}

fn query(url: &str) -> (String, BTreeMap<String, String>) {
    let (path, q) = url.split_once('?').unwrap_or((url, ""));
    let map = q
        .split('&')
        .filter_map(|kv| kv.split_once('='))
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect();
    (path.trim_end_matches('/').to_string(), map)
}

pub fn handle(st: &Arc<Mutex<FakeState>>, mut rq: Request) {
    let method = rq.method().clone();
    let (full, q) = query(rq.url());
    let path = full
        .strip_prefix("/api/cloud-computer/sync")
        .unwrap_or(&full)
        .to_string();
    let auth = rq
        .headers()
        .iter()
        .find(|h| h.field.equiv("Authorization"))
        .map(|h| h.value.to_string());
    let mut body = vec![];
    let _ = rq.as_reader().read_to_end(&mut body);
    if method == Method::Post && full == "/api/auth/login" {
        let v: Value = serde_json::from_slice(&body).unwrap_or_default();
        return if v["password"] == "pw" {
            reply(
                rq,
                200,
                json!({"ok": true, "token": TOKEN, "user": {"id": 1}}),
            )
        } else {
            err(rq, 422, "invalid_credentials", json!({}))
        };
    }
    let mut s = st.lock().unwrap();
    s.requests.push(format!("{method} {path}"));
    if auth.as_deref() != Some(&format!("Bearer {TOKEN}")) {
        return err(rq, 401, "unauthenticated", json!({}));
    }
    if s.fail_next > 0 {
        s.fail_next -= 1;
        return err(rq, 503, "unavailable", json!({}));
    }
    let seg: Vec<&str> = path.trim_start_matches('/').split('/').collect();
    match (&method, seg.as_slice()) {
        (Method::Get, [""]) => {
            let vm = s.vm_key_published.then(|| {
                s.vm_key_override
                    .clone()
                    .unwrap_or_else(|| hex(&public_from_secret(&VM_SECRET)))
            });
            let macs: Vec<Value> = s
                .macs
                .iter()
                .map(|(id, k)| json!({"id": id, "name": "Mac", "publicKey": k, "lastSeenAt": null}))
                .collect();
            let projects: Vec<Value> = s.projects.values().map(project_json).collect();
            reply(
                rq,
                200,
                json!({"ok": true, "enabled": true, "vmKey": vm, "macs": macs, "projects": projects, "usedBytes": 0, "limitBytes": 5368709120u64, "logins": super::logins::both_json(&s.login, &s.claude_login),
                    "consent": s.consent.map(|v| json!({"version": v, "acceptedAt": "2026-10-03T10:00:00+00:00"})),
                    "access": s.access.as_ref().map(|k| json!({"projectKeys": k, "codexCarryOver": "allowed"}))}),
            );
        }
        (Method::Put, ["macs", id]) => {
            let v: Value = serde_json::from_slice(&body).unwrap_or_default();
            let key = v["publicKey"].as_str().unwrap_or_default().to_string();
            s.macs.retain(|m| m.0 != *id);
            s.macs.push((id.to_string(), key.clone()));
            reply(
                rq,
                200,
                json!({"ok": true, "mac": {"id": id, "name": v["name"], "publicKey": key}}),
            );
        }
        (Method::Put, ["api", "cloud-computer", "access", "projects"]) => {
            s.access_puts
                .push(serde_json::from_slice(&body).unwrap_or_default());
            reply(rq, 200, json!({"ok": true}));
        }
        (Method::Post, ["projects"]) => {
            let v: Value = serde_json::from_slice(&body).unwrap_or_default();
            let (key, want) = (
                v["projectKey"].as_str().unwrap_or_default().to_string(),
                v["name"].as_str().unwrap_or_default().to_string(),
            );
            if s.access.as_ref().is_some_and(|k| !k.contains(&key)) {
                return err(rq, 409, "project_not_allowed", json!({"projectKey": key}));
            }
            let existing = s
                .projects
                .values()
                .find(|p| p.key == key)
                .map(|p| p.name.clone());
            let name = existing.unwrap_or_else(|| {
                let clash = s.projects.contains_key(&want);
                let n = if clash {
                    format!("{want}-{}", &key[..4])
                } else {
                    want
                };
                s.projects.insert(
                    n.clone(),
                    P {
                        name: n.clone(),
                        key: key.clone(),
                        ..Default::default()
                    },
                );
                n
            });
            let p = s.projects.get_mut(&name).unwrap();
            p.skipped = v["skipped"]["reason"].as_str().map(String::from);
            reply(rq, 200, json!({"ok": true, "project": project_json(p)}));
        }
        (Method::Put, ["login", p @ ("codex" | "claude")]) => {
            let p = p.to_string();
            super::logins::put(&mut s, rq, &q, body, &p)
        }
        (Method::Delete, ["login", "codex"]) => super::logins::delete(&mut s, rq, &q),
        (Method::Put, ["projects", name, "up"]) => put_up(&mut s, rq, name, &q, body),
        (Method::Delete, ["projects", name]) => {
            s.projects.remove(*name);
            reply(rq, 200, json!({"ok": true}));
        }
        (Method::Get, ["down"]) => {
            let mac = q.get("mac").cloned().unwrap_or_default();
            let items: Vec<Value> = s.down.iter().filter(|d| d.mac == mac && d.acked.is_none()).map(|d| {
                json!({"id": d.id, "project": d.project, "kind": d.kind, "seq": d.seq, "baseSeq": 0, "head": d.head, "bytes": d.sealed.len(), "sha256": hex(&Sha256::digest(&d.sealed)), "createdAt": null})
            }).collect();
            reply(rq, 200, json!({"ok": true, "items": items}));
        }
        (Method::Get, ["down", id]) => match s.down.iter().find(|d| d.id == *id) {
            Some(d) => {
                let h = Header::from_bytes("Content-Type", "application/octet-stream").unwrap();
                let _ = rq.respond(Response::from_data(d.sealed.clone()).with_header(h));
            }
            None => err(rq, 404, "not_found", json!({})),
        },
        (Method::Post, ["down", id, "ack"]) => {
            let v: Value = serde_json::from_slice(&body).unwrap_or_default();
            if let Some(d) = s.down.iter_mut().find(|d| d.id == *id) {
                d.acked = Some(v["applied"].as_bool().unwrap_or(false));
            }
            reply(rq, 200, json!({"ok": true}));
        }
        _ => err(rq, 404, "not_found", json!({})),
    }
}
