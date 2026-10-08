//! Logins made only for Vibyra Cloud (2026-10-07): the artifact goes up sealed to the VM key with `origin=cloud`,
//! for Claude as well as Codex, and is never the Mac's own login file. Fixture strings only.
mod common;
use common::fake::VM_SECRET;
use common::login::*;
use common::rig::*;
use vibyra_sync::crypto::open_bytes;
use vibyra_sync::logins::{pack_entry, CLAUDE_ENTRY};
use vibyra_sync::*;

const TOKEN: &str = "sk-ant-oat01-FIXTURE-not-a-real-token";

#[test]
fn a_claude_login_made_for_cloud_goes_up_sealed_with_origin_cloud() {
    let r = rig();
    let tar = pack_entry(CLAUDE_ENTRY, TOKEN.as_bytes()).unwrap();
    let out = r.engine.send_cloud_login("claude", &tar).unwrap();
    assert!(matches!(out, LoginOutcome::Sent { seq: 1, .. }), "{out:?}");
    let st = r.fake.st.lock().unwrap();
    let (seq, sealed) = st.claude_login.puts[0].clone();
    assert_eq!(seq, 1);
    assert_eq!(st.claude_login.origins, vec![Some("cloud".to_string())]);
    assert!(!String::from_utf8_lossy(&sealed).contains("FIXTURE-not-a-real"));
    assert_eq!(open_bytes(&VM_SECRET, &sealed).unwrap(), tar);
    assert!(st.login.puts.is_empty(), "nothing went to the Codex slot");
}

#[test]
fn a_codex_login_made_for_cloud_counts_past_an_old_copy_and_reports_back() {
    let r = rig();
    put_auth(&r, FAKE);
    r.engine.send_codex_login(&source(&r), true).unwrap(); // an old copy went up as seq 1
    let out = r.engine.send_cloud_login("codex", b"tar").unwrap();
    assert!(matches!(out, LoginOutcome::Sent { seq: 2, .. }), "{out:?}");
    assert_eq!(
        login(&r, |l| l.origins.clone()),
        vec![None, Some("cloud".to_string())]
    );
    let (cloud, has_key) = r.engine.cloud_login("codex").unwrap();
    assert!(has_key && has_cloud_login(&cloud), "{cloud:?}");
    assert!(!has_cloud_login(&r.engine.cloud_login("claude").unwrap().0));
}

#[test]
fn an_unknown_provider_is_refused_before_any_request() {
    let r = rig();
    assert!(r.engine.send_cloud_login("gemini", b"x").is_err());
    assert_eq!(r.fake.count("PUT /login"), 0);
}

#[test]
fn upgrade_cleanup_preserves_a_cloud_owned_replacement() {
    let r = rig();
    put_auth(&r, FAKE);
    r.engine.send_codex_login(&source(&r), true).unwrap();
    let store = vibyra_sync::logins::LoginStore::new(r.engine.state_dir());
    let old_record = store.codex();
    r.engine
        .send_cloud_login("codex", b"cloud login fixture")
        .unwrap();
    // The cleanup process read the old persisted copy record before another
    // process uploaded the independent Cloud login.
    store.save_codex(&old_record).unwrap();
    r.engine.remove_codex_login().unwrap();
    assert_eq!(r.fake.count("DELETE /login/codex"), 0);
    assert!(has_cloud_login(&r.engine.cloud_login("codex").unwrap().0));
    assert!(!r.engine.codex_login_status().sent);
}

#[test]
fn conditional_cleanup_cannot_delete_a_newer_copy_or_cloud_login() {
    let r = rig();
    put_auth(&r, FAKE);
    r.engine.send_codex_login(&source(&r), true).unwrap();
    let client = Client::new(&r.fake.url, common::fake::TOKEN).unwrap();
    client.delete_login_copy("codex", 0).unwrap();
    assert!(login(&r, |l| l.pending.is_some()));
    r.engine
        .send_cloud_login("codex", b"cloud login fixture")
        .unwrap();
    client.delete_login_copy("codex", 1).unwrap();
    client.delete_login_copy("codex", 2).unwrap();
    assert!(has_cloud_login(&r.engine.cloud_login("codex").unwrap().0));
    assert_eq!(login(&r, |l| l.deletes), 0);
}

const ROTATED_SECRET: [u8; 32] = [0x73; 32];
fn rotated_key() -> String {
    vibyra_sync::crypto::hex(&vibyra_sync::crypto::public_from_secret(&ROTATED_SECRET))
}
fn assert_rotated_upload(r: &common::rig::Rig, artifact: &[u8]) {
    let state = r.fake.st.lock().unwrap();
    let sealed = &state.claude_login.puts.last().unwrap().1;
    assert!(
        open_bytes(&ROTATED_SECRET, sealed).is_ok_and(|plain| plain == artifact),
        "accepted retry must open with the current VM key"
    );
    assert!(
        open_bytes(&VM_SECRET, sealed).is_err(),
        "retired VM key must not open retry"
    );
    let saved = vibyra_sync::logins::LoginStore::new(r.engine.state_dir()).provider("claude");
    assert_eq!(saved.sent_key.as_deref(), Some(rotated_key().as_str()));
    assert_eq!(
        state.claude_login.target_keys.last().unwrap().as_deref(),
        Some(rotated_key().as_str())
    );
}
#[test]
fn cloud_upload_reseals_after_sequence_conflict_rotates_the_vm_key() {
    let r = rig();
    {
        let mut state = r.fake.st.lock().unwrap();
        state.claude_login.conflict_once = true;
        state.claude_login.key_on_conflict = Some(Some(rotated_key()));
    }
    let artifact = b"synthetic Cloud upload fixture";
    assert!(matches!(
        r.engine.send_cloud_login("claude", artifact).unwrap(),
        LoginOutcome::Sent { seq: 2, .. }
    ));
    assert_rotated_upload(&r, artifact);
    assert_eq!(r.fake.count("PUT /login/claude"), 2);
}
#[test]
fn cloud_upload_binds_the_stream_target_and_retries_a_mid_upload_rotation() {
    let r = rig();
    r.fake.st.lock().unwrap().claude_login.key_on_put = Some(Some(rotated_key()));
    let artifact = b"synthetic Cloud upload fixture";
    assert!(matches!(
        r.engine.send_cloud_login("claude", artifact).unwrap(),
        LoginOutcome::Sent { .. }
    ));
    assert_rotated_upload(&r, artifact);
    assert_eq!(r.fake.count("PUT /login/claude"), 2);
}
#[test]
fn cloud_upload_waits_if_the_vm_key_disappears_during_upload() {
    let r = rig();
    r.fake.st.lock().unwrap().claude_login.key_on_put = Some(None);
    assert!(matches!(
        r.engine.send_cloud_login("claude", b"fixture").unwrap(),
        LoginOutcome::WaitingForCloud
    ));
    assert!(r.fake.st.lock().unwrap().claude_login.puts.is_empty());
    assert_eq!(r.fake.count("PUT /login/claude"), 1);
}
#[test]
fn cloud_upload_conflicts_remain_bounded_to_three_attempts() {
    let r = rig();
    r.fake.st.lock().unwrap().claude_login.conflicts_remaining = 4;
    assert!(r.engine.send_cloud_login("claude", b"fixture").is_err());
    assert_eq!(r.fake.count("PUT /login/claude"), 3);
    assert!(r.fake.st.lock().unwrap().claude_login.puts.is_empty());
}
