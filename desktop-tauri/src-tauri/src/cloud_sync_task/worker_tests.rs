//! Gating, registration, debounce, sweep, backoff and quitting, against the fake rig.

use super::worker_rig::*;

#[test]
fn nothing_runs_signed_out_unconsented_paused_or_without_a_cloud_computer() {
    let mut r = rig(&["a"]);
    r.cfg.lock().signed_in = false;
    r.settle();
    assert!(r.calls().is_empty());
    assert_eq!(r.board.lock().gate, Gate::SignedOut);

    r.cfg.lock().signed_in = true;
    r.cfg.lock().sync.consent_version = 0;
    r.settle();
    assert_eq!(
        r.calls(),
        vec!["account"],
        "only asks whether the phone agreed"
    );
    assert_eq!(r.board.lock().gate, Gate::NeedsConsent);

    r.cfg.lock().sync.consent_version = CLOUD_SYNC_CONSENT_VERSION;
    r.cfg.lock().sync.set_paused(true);
    r.settle();
    assert_eq!(r.calls(), vec!["account"]);
    assert_eq!(r.board.lock().gate, Gate::Off);

    r.cfg.lock().sync.set_paused(false);
    *r.fake.cloud_enabled.lock() = false;
    r.advance(SWEEP_MS);
    assert_eq!(r.calls(), vec!["account", "account"]);
    assert_eq!(r.board.lock().gate, Gate::Unavailable);
    assert!(r.worker.watch_roots().is_empty());
}

#[test]
fn consent_registers_once_syncs_every_enabled_project_and_skips_switched_off_ones() {
    let mut r = rig(&["a", "b", "c"]);
    r.cfg.lock().sync.set_project("b", false);
    r.cfg.lock().sync.include_env = true;
    r.settle();
    assert_eq!(r.count("register"), 1);
    assert_eq!(r.count("sync a env=true conv=true"), 1);
    assert_eq!(r.count("sync c"), 1);
    assert_eq!(r.count("sync b"), 0, "a switched-off project is not synced");
    assert_eq!(r.worker.watch_roots().len(), 2);
    for _ in 0..5 {
        r.advance(1_000);
    }
    assert_eq!(r.count("register"), 1, "this Mac is registered once");
    assert_eq!(
        r.fake.max_depth.load(Ordering::SeqCst),
        1,
        "one upload at a time"
    );
}

#[test]
fn a_file_change_uploads_after_the_quiet_period_and_not_before() {
    let mut r = rig(&["a"]);
    r.settle();
    assert_eq!(r.count("sync a"), 1);
    r.worker.handle(Msg::Changed("a".into()));
    r.advance(DEBOUNCE_MS - 1_000);
    assert_eq!(r.count("sync a"), 1);
    r.advance(1_000);
    assert_eq!(r.count("sync a"), 2);
    // The conversations switch reaches the engine.
    r.cfg.lock().sync.include_conversations = false;
    r.worker.handle(Msg::SyncNow(Some("a".into())));
    r.settle();
    assert_eq!(r.count("sync a env=false conv=false"), 1);
}

#[test]
fn the_sweep_syncs_everything_every_two_minutes() {
    let mut r = rig(&["a", "b"]);
    r.settle();
    r.advance(SWEEP_MS + 1_000);
    assert_eq!(r.count("sync a"), 2);
    assert_eq!(r.count("sync b"), 2);
}

#[test]
fn offline_stops_all_work_with_backoff_and_a_wake_resumes_it() {
    let mut r = rig(&["a"]);
    r.settle();
    r.fake
        .sync_results
        .lock()
        .push_back(Err(SyncError::Network("down".into())));
    r.worker.handle(Msg::SyncNow(None));
    r.settle();
    assert_eq!(r.count("sync a"), 2);
    assert!(r
        .board
        .lock()
        .message
        .as_deref()
        .unwrap_or("")
        .contains("reach the cloud"));
    let before = r.calls().len();
    r.advance(5_000);
    r.advance(10_000);
    assert_eq!(
        r.calls().len(),
        before,
        "no requests while backed off, not even a poll"
    );
    r.worker.handle(Msg::Wake);
    r.settle();
    assert!(
        r.calls().len() > before,
        "waking the Mac tries again at once"
    );
    assert!(r.count("poll") >= 1, "and asks the cloud for changes");
}

#[test]
fn a_project_error_backs_off_that_project_only() {
    let mut r = rig(&["a", "b"]);
    r.fake
        .sync_results
        .lock()
        .push_back(Err(SyncError::Io("folder is gone".into())));
    r.settle();
    assert_eq!(r.count("sync a") + r.count("sync b"), 2);
    let live = r.board.lock().projects.get("a").cloned().unwrap();
    assert_eq!(live.error.as_deref(), Some("folder is gone"));
    assert!(live.retry_at.is_some());
    assert!(r
        .board
        .lock()
        .projects
        .get("b")
        .is_some_and(|p| p.error.is_none()));
    r.advance(31_000);
    assert_eq!(r.count("sync a"), 2, "retried after the first backoff");
}

#[test]
fn quitting_flushes_unsynced_edits_and_answers_when_done() {
    let mut r = rig(&["a"]);
    r.settle();
    r.worker.handle(Msg::Changed("a".into()));
    let (tx, rx) = channel();
    r.worker.handle(Msg::FlushAndAck(tx));
    assert!(rx.try_recv().is_err());
    r.settle();
    assert_eq!(
        r.count("sync a"),
        2,
        "the pending edit went up without waiting for the debounce"
    );
    assert!(rx.try_recv().is_ok());
    // A closed gate answers at once so quitting never waits for nothing.
    r.cfg.lock().signed_in = false;
    let (tx, rx) = channel();
    r.worker.handle(Msg::FlushAndAck(tx));
    r.settle();
    assert!(rx.try_recv().is_ok());
}
