use super::routes::{err, project_json, reply};
use super::{Blob, FakeState};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use tiny_http::Request;
use vibyra_sync::crypto::hex;

pub(super) fn put_up(
    s: &mut FakeState,
    rq: Request,
    name: &str,
    q: &BTreeMap<String, String>,
    body: Vec<u8>,
) {
    let get = |k: &str| q.get(k).cloned().unwrap_or_default();
    let (kind, seq, base_seq, head) = (
        get("kind"),
        get("seq").parse::<u64>().unwrap_or(0),
        get("baseSeq").parse::<u64>().unwrap_or(0),
        get("head"),
    );
    if hex(&Sha256::digest(&body)) != get("sha256") {
        return err(rq, 422, "sha_mismatch", json!({}));
    }
    if s.quota_exceeded {
        return err(rq, 413, "quota_exceeded", json!({}));
    }
    if s.resync_once_on_put {
        s.resync_once_on_put = false;
        s.projects.get_mut(name).unwrap().resync = true;
    }
    let conflict = std::mem::take(&mut s.conflict_once);
    let Some(p) = s.projects.get_mut(name) else {
        return err(rq, 404, "not_found", json!({}));
    };
    let last = if kind == "code" {
        p.up_seq
    } else {
        p.transcripts_seq
    };
    if conflict {
        if kind == "code" {
            p.up_seq += 1
        } else {
            p.transcripts_seq += 1
        }
        return err(rq, 409, "seq_conflict", json!({"expected": last + 2}));
    }
    if seq != last + 1 {
        return err(rq, 409, "seq_conflict", json!({"expected": last + 1}));
    }
    if kind == "code" && p.resync && base_seq != 0 {
        return err(rq, 409, "resync_required", json!({}));
    }
    if kind == "code" {
        p.up_seq = seq;
        p.up_head = Some(head.clone());
        if base_seq == 0 {
            p.resync = false;
        }
    } else {
        p.transcripts_seq = seq;
    }
    let out = project_json(p);
    s.ups.push(Blob {
        project: name.into(),
        kind,
        seq,
        base_seq,
        head,
        sealed: body,
    });
    reply(rq, 200, json!({"ok": true, "project": out}));
}
