//! The account's "Connect to cloud" agreement (iPhone or Mac) counts as this Mac's consent; only "Pause syncing
//! on this Mac" keeps it out.

use super::worker_rig::*;

fn unconsented(ids: &[&str]) -> Rig {
    let r = rig(ids);
    r.cfg.lock().sync.consent_version = 0;
    r
}

#[test]
fn a_phone_consent_syncs_without_the_mac_dialog_and_writes_no_settings() {
    let mut r = unconsented(&["a"]);
    *r.fake.remote_consent.lock() = Some(CLOUD_SYNC_CONSENT_VERSION);
    r.settle();
    assert_eq!(r.board.lock().gate, Gate::Ready);
    assert!(r.board.lock().consent_from_phone);
    assert_eq!(
        r.count("account"),
        1,
        "the consent check doubles as the cloud check"
    );
    assert_eq!(r.count("register"), 1);
    assert_eq!(r.count("sync a"), 1);
    assert_eq!(r.cfg.lock().sync.consent_version, 0);
}

#[test]
fn without_a_phone_consent_nothing_syncs_and_it_asks_again_later() {
    let mut r = unconsented(&["a"]);
    assert_eq!(r.settle(), ACCOUNT_MS);
    assert_eq!(r.board.lock().gate, Gate::NeedsConsent);
    assert!(r.board.lock().consent_checked && !r.board.lock().consent_from_phone);
    r.advance(10_000);
    assert_eq!(r.calls(), vec!["account"], "at most every 15 s");
    *r.fake.remote_consent.lock() = Some(CLOUD_SYNC_CONSENT_VERSION);
    r.advance(ACCOUNT_MS - 10_000);
    assert_eq!(r.board.lock().gate, Gate::Ready);
    assert_eq!(r.count("sync a"), 1);
}

#[test]
fn an_older_phone_consent_does_not_count() {
    let mut r = unconsented(&["a"]);
    *r.fake.remote_consent.lock() = Some(CLOUD_SYNC_CONSENT_VERSION - 1);
    r.settle();
    assert_eq!(r.board.lock().gate, Gate::NeedsConsent);
    assert_eq!(r.count("sync"), 0);
}

#[test]
fn pausing_this_mac_wins_over_an_account_consent() {
    let mut r = unconsented(&["a"]);
    *r.fake.remote_consent.lock() = Some(CLOUD_SYNC_CONSENT_VERSION);
    r.cfg.lock().sync.set_paused(true);
    r.settle();
    assert_eq!(r.board.lock().gate, Gate::Off);
    assert!(r.calls().is_empty());
}

#[test]
fn offline_keeps_checking_without_opening_the_dialog() {
    let mut r = unconsented(&["a"]);
    *r.fake.account_offline.lock() = true;
    r.settle();
    assert_eq!(r.board.lock().gate, Gate::Starting);
    assert!(!r.board.lock().consent_checked);
}

/// The owner's Mac on 2026-10-06: settings never touched here (`enabled:false`, `consentVersion:0`, no `paused`
/// key), agreed and ticked on the iPhone. That alone must make this Mac upload.
#[test]
fn an_iphone_agreement_alone_syncs_a_mac_whose_settings_were_never_touched() {
    let stored: CloudSyncSettings =
        serde_json::from_str(r#"{"enabled":false,"consentVersion":0,"includeConversations":true}"#)
            .unwrap();
    assert!(!stored.paused);
    let mut r = rig(&["a", "b"]);
    r.cfg.lock().sync = stored;
    *r.fake.remote_consent.lock() = Some(CLOUD_SYNC_CONSENT_VERSION);
    *r.fake.access.lock() = Some(vibyra_sync::CloudAccess {
        project_keys: vec![project_key("a")],
        codex_carry_over: "allowed".into(),
    });
    r.settle();
    assert_eq!(r.board.lock().gate, Gate::Ready);
    assert_eq!((r.count("sync a"), r.count("sync b")), (1, 0));
    assert_eq!(r.board.lock().account_consent, Some(true));
}

#[test]
fn a_paused_mac_stays_out_even_with_the_agreement_and_resumes_when_the_pause_lifts() {
    let mut r = unconsented(&["a"]);
    *r.fake.remote_consent.lock() = Some(CLOUD_SYNC_CONSENT_VERSION);
    r.cfg.lock().sync = serde_json::from_str(r#"{"enabled":false,"consentVersion":1}"#).unwrap();
    assert!(
        r.cfg.lock().sync.paused,
        "agreed here, then switched off: stays off"
    );
    r.settle();
    assert_eq!(r.board.lock().gate, Gate::Off);
    assert_eq!(r.count("sync"), 0);
    r.cfg.lock().sync.set_paused(false);
    r.worker.handle(Msg::Reconfigure);
    r.settle();
    assert_eq!(r.board.lock().gate, Gate::Ready);
    assert_eq!(r.count("sync a"), 1);
}

#[test]
fn a_withdrawn_agreement_closes_the_gate_within_15_s() {
    let mut r = unconsented(&["a"]);
    *r.fake.remote_consent.lock() = Some(CLOUD_SYNC_CONSENT_VERSION);
    r.settle();
    assert_eq!(r.board.lock().gate, Gate::Ready);
    *r.fake.remote_consent.lock() = None;
    r.advance(ACCOUNT_MS);
    assert_eq!(r.board.lock().gate, Gate::NeedsConsent);
    assert_eq!(r.board.lock().account_consent, Some(false));
}
