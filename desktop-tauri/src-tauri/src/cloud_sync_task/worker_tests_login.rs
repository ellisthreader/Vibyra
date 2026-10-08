//! Upgrade coverage: old saved flags cannot resume copying local credentials.
use super::view_login::codex_login_view;
use super::worker_rig::*;

#[test]
fn saved_copy_opt_in_never_reads_or_sends_a_local_login() {
    let mut r = rig(&["a", "b"]);
    r.cfg.lock().sync.share_codex_login = true;
    r.settle();
    r.worker.handle(Msg::SyncNow(None));
    r.advance(130_000);
    r.worker.handle(Msg::Wake);
    r.advance(130_000);
    assert_eq!(r.count("login send"), 0);
    assert!(r.count("sync a") >= 2, "authorized projects still sync");
    let view = codex_login_view(&r.cfg.lock().sync, Gate::Ready, &r.board.lock());
    assert!(!view.on);
    assert_eq!(view.state, "off");
}

#[test]
fn upgrade_cleans_a_recorded_copy_once_and_does_not_need_phone_presence() {
    let mut r = rig(&["a"]);
    r.cfg.lock().sync.share_codex_login = true;
    *r.fake.login_sent_at.lock() = Some(1_700_000_000);
    r.settle();
    r.advance(130_000);
    assert_eq!(r.count("login remove"), 1);
    assert_eq!(r.count("login send"), 0);
    assert_eq!(r.board.lock().login.sent_at, None);
}

#[test]
fn cleanup_waits_for_sign_in_and_never_sends() {
    let mut r = rig(&["a"]);
    *r.fake.login_sent_at.lock() = Some(1_700_000_000);
    r.cfg.lock().signed_in = false;
    r.settle();
    assert_eq!(r.count("login remove"), 0);
    r.cfg.lock().signed_in = true;
    r.advance(60_000);
    assert_eq!(r.count("login remove"), 1);
    assert_eq!(r.count("login send"), 0);
}

#[test]
fn an_account_that_never_copied_has_nothing_to_remove() {
    let mut r = rig(&["a"]);
    r.settle();
    r.advance(130_000);
    assert_eq!(r.count("login remove"), 0);
    assert_eq!(r.count("login send"), 0);
}

#[test]
fn a_new_account_clears_old_live_errors_and_receipts_before_any_response() {
    let mut r = rig(&["a"]);
    r.settle();
    r.worker.session = Some("previous-account".into());
    r.board.lock().message = Some("Previous account error".into());
    r.board.lock().login.error = Some("Previous login error".into());
    r.board.lock().account_consent = Some(true);
    r.cfg.lock().sync.consent_version = 0;
    *r.fake.account_offline.lock() = true;
    r.worker.step();
    let board = r.board.lock();
    assert!(board.message.is_none());
    assert!(board.login.error.is_none());
    assert_eq!(board.account_consent, None);
    assert!(!board.consent_from_phone);
}
