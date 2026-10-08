//! Only ticked projects go to Vibyra Cloud; a refusal is "not chosen", not an error; the iPhone can turn the
//! Codex carry-over off.

use super::worker_rig::*;
use vibyra_sync::CloudAccess;

fn access(ids: &[&str], codex: &str) -> Option<CloudAccess> {
    Some(CloudAccess {
        project_keys: ids.iter().map(|i| project_key(i)).collect(),
        codex_carry_over: codex.into(),
    })
}

fn not_allowed() -> SyncError {
    SyncError::Api {
        status: 409,
        code: "project_not_allowed".into(),
        message: "Not chosen".into(),
    }
}

#[test]
fn only_ticked_projects_sync_and_the_rest_show_as_not_chosen() {
    let mut r = rig(&["a", "b"]);
    *r.fake.access.lock() = access(&["a"], "allowed");
    r.settle();
    assert_eq!(r.count("sync a"), 1);
    assert_eq!(r.count("sync b"), 0);
    assert!(r.board.lock().not_chosen.contains("b"));
    assert_eq!(r.worker.watch_roots().len(), 1);
    // Ticked on the phone: the next account read picks it up.
    *r.fake.access.lock() = access(&["a", "b"], "allowed");
    r.advance(SWEEP_MS + 1);
    assert_eq!(r.count("sync b"), 1);
    assert!(r.board.lock().not_chosen.is_empty());
}

#[test]
fn an_older_server_without_access_keeps_syncing_everything() {
    let mut r = rig(&["a", "b"]);
    r.settle();
    assert_eq!((r.count("sync a"), r.count("sync b")), (1, 1));
    assert!(r.board.lock().not_chosen.is_empty());
}

#[test]
fn a_refused_project_is_not_an_error_and_waits_for_the_next_account_read() {
    let mut r = rig(&["a"]);
    *r.fake.access.lock() = access(&["a"], "allowed");
    r.fake.sync_results.lock().push_back(Err(not_allowed()));
    r.settle();
    assert_eq!(r.count("sync a"), 1);
    {
        let board = r.board.lock();
        assert!(board.projects["a"].error.is_none());
        assert!(board.message.is_none());
        assert!(board.not_chosen.contains("a"));
    }
    r.worker.handle(Msg::Changed("a".into()));
    r.advance(ACCOUNT_MS / 2);
    assert_eq!(
        r.count("sync a"),
        1,
        "no retry before the account is read again"
    );
    r.advance(ACCOUNT_MS);
    assert_eq!(r.count("sync a"), 2);
}

#[test]
fn the_iphone_can_turn_the_codex_login_off() {
    let mut r = rig(&["a"]);
    r.cfg.lock().sync.share_codex_login = true;
    *r.fake.access.lock() = access(&["a"], "blocked");
    r.settle();
    r.advance(SWEEP_MS + 1);
    assert_eq!(r.count("login send"), 0);
    assert!(r.board.lock().codex_blocked);
    // Provider permission cannot revive retired local-login copying.
    *r.fake.access.lock() = access(&["a"], "allowed");
    r.advance(SWEEP_MS + 1);
    assert_eq!(r.count("login send"), 0);
    assert!(!r.board.lock().codex_blocked);
}

#[test]
fn a_legacy_login_error_is_never_requested_or_shown() {
    let mut r = rig(&["a"]);
    r.cfg.lock().sync.share_codex_login = true;
    r.fake.login_results.lock().push_back(Err(SyncError::Api {
        status: 409,
        code: "login_blocked".into(),
        message: "Turned off".into(),
    }));
    r.settle();
    assert_eq!(r.count("login send"), 0);
    let board = r.board.lock();
    assert!(board.login.error.is_none() && board.message.is_none());
}

#[test]
fn a_tick_or_untick_on_the_iphone_reaches_this_mac_within_15_s() {
    let mut r = rig(&["a", "b"]);
    *r.fake.access.lock() = access(&["a"], "allowed");
    r.settle();
    assert_eq!((r.count("sync a"), r.count("sync b")), (1, 0));
    *r.fake.access.lock() = access(&["a", "b"], "allowed");
    r.advance(ACCOUNT_MS);
    assert_eq!(
        r.count("sync b"),
        1,
        "ticked on the iPhone: goes up on the next read"
    );
    assert!(r.board.lock().not_chosen.is_empty());
    *r.fake.access.lock() = access(&["a"], "allowed");
    r.advance(ACCOUNT_MS);
    assert!(r.board.lock().not_chosen.contains("b"));
    assert!(r.worker.watch_roots().iter().all(|(id, _)| id != "b"));
}

#[test]
fn the_account_tick_wins_over_this_macs_old_switch() {
    let mut r = rig(&["a", "b"]);
    r.cfg.lock().sync.set_project("b", false);
    *r.fake.access.lock() = access(&["a", "b"], "allowed");
    r.settle();
    assert_eq!(
        r.count("sync b"),
        1,
        "ticked on the iPhone after this Mac switched it off"
    );
    assert!(r.board.lock().ticked_by_account);
}

#[test]
fn an_older_server_still_uses_this_macs_switch() {
    let mut r = rig(&["a", "b"]);
    r.cfg.lock().sync.set_project("b", false);
    r.settle();
    assert_eq!((r.count("sync a"), r.count("sync b")), (1, 0));
    assert!(!r.board.lock().ticked_by_account);
}

#[test]
fn the_account_is_read_every_15_s_while_ready_and_never_faster_than_10_s() {
    let mut r = rig(&["a"]);
    *r.fake.access.lock() = access(&["a"], "allowed");
    r.settle();
    let first = r.count("account");
    for _ in 0..12 {
        r.advance(5_000);
    }
    let reads = r.count("account") - first;
    assert!((4..=5).contains(&reads), "60 s of idle made {reads} reads");
    r.worker.handle(Msg::Changed("a".into()));
    r.advance(1_000);
    r.advance(1_000);
    assert!(
        r.count("account") - first <= 5,
        "a file change does not read the account"
    );
}
