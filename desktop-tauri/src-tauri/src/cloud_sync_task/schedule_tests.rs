use super::schedule::*;

fn ids(list: &[&str]) -> Vec<String> {
    list.iter().map(|s| s.to_string()).collect()
}

/// A scheduler with `a` and `b` that already finished their first upload.
fn settled() -> (Scheduler, u64) {
    let mut s = Scheduler::new(0);
    s.set_projects(&ids(&["a", "b"]), 0);
    let mut now = 0;
    while let Action::Sync(id) = s.next(now) {
        s.begin_sync(&id);
        s.end_sync(&id, Ok(()), now);
    }
    assert_eq!(s.next(now), Action::Poll);
    s.begin_poll();
    s.end_poll(Ok(()), now);
    now += 1;
    (s, now)
}

#[test]
fn new_projects_are_due_at_once_and_one_runs_at_a_time() {
    let mut s = Scheduler::new(0);
    s.set_projects(&ids(&["a", "b"]), 0);
    let first = s.next(0);
    let Action::Sync(id) = first else {
        panic!("expected a sync, got {first:?}")
    };
    s.begin_sync(&id);
    // While one upload runs nothing else is handed out, not even a poll.
    assert!(matches!(s.next(0), Action::Idle(_)));
    s.end_sync(&id, Ok(()), 10);
    assert!(matches!(s.next(10), Action::Sync(other) if other != id));
}

#[test]
fn a_change_waits_for_fifteen_seconds_of_quiet() {
    let (mut s, now) = settled();
    s.changed("a", now);
    assert_eq!(s.next(now + DEBOUNCE_MS - 1), Action::Idle(1));
    s.changed("a", now + 10_000); // more typing pushes it back
    assert!(matches!(s.next(now + DEBOUNCE_MS + 5_000), Action::Idle(_)));
    assert_eq!(s.next(now + 10_000 + DEBOUNCE_MS), Action::Sync("a".into()));
}

#[test]
fn constant_editing_still_uploads_within_the_max_wait() {
    let (mut s, now) = settled();
    let mut t = now;
    while t < now + MAX_WAIT_MS {
        s.changed("a", t);
        t += 5_000;
    }
    assert_eq!(s.next(now + MAX_WAIT_MS), Action::Sync("a".into()));
}

#[test]
fn an_edit_during_an_upload_stays_due() {
    let (mut s, now) = settled();
    s.changed("a", now);
    let t = now + DEBOUNCE_MS;
    assert_eq!(s.next(t), Action::Sync("a".into()));
    s.begin_sync("a");
    s.changed("a", t + 100);
    s.end_sync("a", Ok(()), t + 200);
    assert!(s.is_dirty("a"), "the newer edit has not gone up");
    assert_eq!(s.next(t + 200 + DEBOUNCE_MS), Action::Sync("a".into()));
}

#[test]
fn focus_loss_flushes_only_what_changed() {
    let (mut s, now) = settled();
    s.changed("b", now);
    s.flush_dirty(now + 100);
    assert_eq!(s.next(now + 100), Action::Sync("b".into()));
    s.begin_sync("b");
    s.end_sync("b", Ok(()), now + 100);
    assert!(
        matches!(s.next(now + 101), Action::Idle(_)),
        "a was clean and stays untouched"
    );
}

#[test]
fn the_sweep_makes_everything_due_every_two_minutes() {
    let (mut s, _) = settled();
    let first = s.next(SWEEP_MS);
    assert!(matches!(first, Action::Sync(_)));
    s.begin_sync("a");
    s.end_sync("a", Ok(()), SWEEP_MS);
    assert_eq!(s.next(SWEEP_MS), Action::Sync("b".into()));
}

#[test]
fn the_cloud_is_polled_every_minute() {
    let (mut s, now) = settled();
    assert!(matches!(s.next(now + POLL_MS - 2), Action::Idle(_)));
    assert_eq!(s.next(now + POLL_MS), Action::Poll);
}

#[test]
fn project_errors_back_off_per_project_and_the_others_carry_on() {
    let (mut s, now) = settled();
    s.changed("a", now);
    s.changed("b", now);
    let t = now + DEBOUNCE_MS;
    s.begin_sync("a");
    s.end_sync("a", Err(Failure::Project), t);
    assert_eq!(s.failures("a"), 1);
    assert_eq!(s.retry_at("a"), Some(t + 30_000));
    assert_eq!(
        s.next(t),
        Action::Sync("b".into()),
        "b is not held up by a's failure"
    );
    s.begin_sync("b");
    s.end_sync("b", Ok(()), t);
    assert!(matches!(s.next(t + 29_999), Action::Idle(_)));
    assert_eq!(s.next(t + 30_000), Action::Sync("a".into()));
}

#[test]
fn backoff_grows_and_is_capped() {
    assert_eq!(backoff(1), 30_000);
    assert_eq!(backoff(2), 60_000);
    assert_eq!(backoff(3), 120_000);
    assert_eq!(backoff(6), 900_000);
    assert_eq!(backoff(40), 900_000);
    let (mut s, mut now) = settled();
    for failure in 1..=3u32 {
        s.sync_now(Some("a"), now);
        assert_eq!(s.next(now), Action::Sync("a".into()));
        s.begin_sync("a");
        s.end_sync("a", Err(Failure::Project), now);
        assert_eq!(s.retry_at("a"), Some(now + backoff(failure)));
        now += backoff(failure);
    }
    // Success clears it.
    s.begin_sync("a");
    s.end_sync("a", Ok(()), now);
    assert_eq!(s.failures("a"), 0);
}

#[test]
fn offline_pauses_everything_and_waking_resumes_it() {
    let (mut s, now) = settled();
    s.changed("a", now);
    let t = now + DEBOUNCE_MS;
    s.begin_sync("a");
    s.end_sync("a", Err(Failure::Network), t);
    assert!(s.is_paused(t));
    assert!(
        matches!(s.next(t + 1_000), Action::Idle(_)),
        "no work, not even a poll, while offline"
    );
    s.wake(t + 2_000);
    assert!(!s.is_paused(t + 2_000));
    assert_eq!(s.next(t + 2_000), Action::Sync("a".into()));
}

#[test]
fn a_refused_session_waits_for_the_user_not_a_retry_storm() {
    let (mut s, now) = settled();
    s.changed("a", now);
    let t = now + DEBOUNCE_MS;
    s.begin_sync("a");
    s.end_sync("a", Err(Failure::Auth), t);
    assert!(s.is_paused(t + 299_000));
    s.resume();
    assert!(!s.is_paused(t + 1));
}

#[test]
fn sync_now_ignores_backoff_and_removed_projects_are_forgotten() {
    let (mut s, now) = settled();
    s.sync_now(Some("a"), now);
    s.begin_sync("a");
    s.end_sync("a", Err(Failure::Project), now);
    s.sync_now(Some("a"), now + 1);
    assert_eq!(s.next(now + 1), Action::Sync("a".into()));
    s.set_projects(&ids(&["b"]), now + 2);
    assert!(!s.is_dirty("a"));
    assert_eq!(s.failures("a"), 0);
}
