//! Codex login carry-over: sealing, the upload, spacing, retries, removal. Fixture files only (obviously
//! fake contents in a temp dir); the real `~/.codex/auth.json` is never touched.
mod common;
use common::fake::VM_SECRET;
use common::login::*;
use common::rig::*;
use vibyra_sync::crypto::open_bytes;
use vibyra_sync::logins::unpack_codex;
use vibyra_sync::*;

#[test]
fn a_login_goes_up_sealed_to_the_vm_key_as_one_tar_entry_and_never_in_the_clear() {
    let r = rig();
    put_auth(&r, FAKE);
    let out = r.engine.send_codex_login(&source(&r), false).unwrap();
    let LoginOutcome::Sent { seq, bytes } = out else {
        panic!("{out:?}")
    };
    assert_eq!(seq, 1);
    let (sealed, put_seq) = login(&r, |l| (l.puts[0].1.clone(), l.puts[0].0));
    assert_eq!((put_seq, bytes), (1, sealed.len() as u64));
    assert!(!String::from_utf8_lossy(&sealed).contains("FAKE-REFRESH"));
    let tar = open_bytes(&VM_SECRET, &sealed).expect("the VM key opens it");
    assert_eq!(unpack_codex(&tar).unwrap(), FAKE.as_bytes());
    let status = r.engine.codex_login_status();
    assert!(status.sent && status.sent_at.is_some() && status.seq == 1);
}

#[test]
fn an_unchanged_file_is_not_sent_again_and_costs_no_request_unless_forced() {
    let r = rig();
    put_auth(&r, FAKE);
    r.engine.send_codex_login(&source(&r), false).unwrap();
    let before = r.fake.st.lock().unwrap().requests.len();
    assert_eq!(
        r.engine.send_codex_login(&source(&r), false).unwrap(),
        LoginOutcome::Unchanged
    );
    assert_eq!(r.fake.st.lock().unwrap().requests.len(), before);
    // Forced: one read of the cloud's state, still no upload.
    assert_eq!(
        r.engine.send_codex_login(&source(&r), true).unwrap(),
        LoginOutcome::Unchanged
    );
    assert_eq!(r.fake.count("PUT /login"), 1);
}

#[test]
fn a_changed_file_waits_ten_minutes_unless_forced_and_the_seq_only_grows() {
    let r = rig();
    put_auth(&r, FAKE);
    r.engine.send_codex_login(&source(&r), false).unwrap();
    put_auth(&r, r#"{"tokens":{"refresh_token":"FAKE-REFRESH-TOKEN-2"}}"#);
    let LoginOutcome::Throttled { retry_in_secs } =
        r.engine.send_codex_login(&source(&r), false).unwrap()
    else {
        panic!("expected throttling")
    };
    assert!(retry_in_secs > 500 && retry_in_secs <= 600);
    assert_eq!(r.fake.count("PUT /login"), 1);
    backdate_sent_at(&r);
    assert_eq!(
        r.engine.send_codex_login(&source(&r), false).unwrap(),
        LoginOutcome::Sent {
            seq: 2,
            bytes: login(&r, |l| l.puts[1].1.len() as u64)
        }
    );
    put_auth(&r, r#"{"tokens":{"refresh_token":"FAKE-REFRESH-TOKEN-3"}}"#);
    assert!(matches!(
        r.engine.send_codex_login(&source(&r), true).unwrap(),
        LoginOutcome::Sent { seq: 3, .. }
    ));
}

#[test]
fn no_file_means_not_signed_in_and_a_waiting_cloud_means_waiting() {
    let r = rig();
    assert_eq!(
        r.engine.send_codex_login(&source(&r), false).unwrap(),
        LoginOutcome::NotSignedIn
    );
    assert_eq!(r.fake.count("PUT /login") + r.fake.count("GET /"), 0);
    put_auth(&r, FAKE);
    r.fake.st.lock().unwrap().vm_key_published = false;
    assert_eq!(
        r.engine.send_codex_login(&source(&r), false).unwrap(),
        LoginOutcome::WaitingForCloud
    );
    assert!(!r.engine.codex_login_status().sent);
    r.fake.st.lock().unwrap().vm_key_published = true;
    assert!(matches!(
        r.engine.send_codex_login(&source(&r), false).unwrap(),
        LoginOutcome::Sent { .. }
    ));
}

#[test]
fn a_seq_conflict_rereads_the_cloud_and_retries_and_a_too_large_reply_is_an_error() {
    let r = rig();
    put_auth(&r, FAKE);
    r.fake.st.lock().unwrap().login.conflict_once = true;
    let LoginOutcome::Sent { seq, .. } = r.engine.send_codex_login(&source(&r), false).unwrap()
    else {
        panic!()
    };
    assert_eq!(seq, 2);
    put_auth(&r, r#"{"tokens":{"refresh_token":"FAKE-REFRESH-TOKEN-2"}}"#);
    r.fake.st.lock().unwrap().login.too_large = true;
    let e = r.engine.send_codex_login(&source(&r), true).unwrap_err();
    assert_eq!(e.code(), Some("too_large"));
    assert_eq!(r.engine.codex_login_status().seq, 2);
}

#[test]
fn a_cloud_that_lost_the_login_or_a_new_vm_key_gets_it_again_on_a_forced_send() {
    let r = rig();
    put_auth(&r, FAKE);
    r.engine.send_codex_login(&source(&r), false).unwrap();
    r.fake.st.lock().unwrap().login.seq = 0; // the backend forgot
    assert!(matches!(
        r.engine.send_codex_login(&source(&r), true).unwrap(),
        LoginOutcome::Sent { seq: 2, .. }
    ));
    // Sealed to some other key before: the forced send seals it to the current one.
    let path = r.engine.state_dir().join("cloud-sync/logins.json");
    let mut v: serde_json::Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
    v["codex"]["sentKey"] = serde_json::json!("ab".repeat(32));
    std::fs::write(&path, serde_json::to_vec(&v).unwrap()).unwrap();
    assert!(matches!(
        r.engine.send_codex_login(&source(&r), true).unwrap(),
        LoginOutcome::Sent { seq: 3, .. }
    ));
}

#[test]
fn removing_deletes_in_the_cloud_forgets_the_hash_and_keeps_the_seq() {
    let r = rig();
    put_auth(&r, FAKE);
    r.engine.send_codex_login(&source(&r), false).unwrap();
    r.engine.remove_codex_login().unwrap();
    assert_eq!(r.fake.count("DELETE /login/codex"), 1);
    assert!(login(&r, |l| l.pending.is_none()));
    assert_eq!(
        r.engine.codex_login_status(),
        LoginStatus {
            sent: false,
            sent_at: None,
            seq: 1
        }
    );
    // Switched on again: the same file goes up as the next seq, immediately.
    assert!(matches!(
        r.engine.send_codex_login(&source(&r), false).unwrap(),
        LoginOutcome::Sent { seq: 2, .. }
    ));
}
