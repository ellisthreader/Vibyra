use super::*;
#[test]
fn replacing_account_cancels_old_job_and_clears_provider_state() {
    let mut inner = Inner::default();
    inner.scope("A", 1);
    let old = inner.generation;
    let cancel = Arc::new(AtomicBool::new(false));
    inner.job = Some(Job {
        generation: old,
        cancel: cancel.clone(),
    });
    inner.views[0].state = "done";
    inner.views[0].error = Some("Account A detail".into());
    inner.scope("B", 2);
    assert!(cancel.load(Ordering::SeqCst));
    assert!(!inner.current("A", 1, old));
    assert!(inner
        .views
        .iter()
        .all(|v| v.error.is_none() && v.state != "done"));
    assert!(inner.job.is_none());
}
#[test]
fn reading_same_account_preserves_an_in_progress_sign_in() {
    let mut inner = Inner::default();
    inner.scope("A", 1);
    let generation = inner.generation;
    inner.views[0].state = "allowing";
    inner.scope("A", 1);
    assert_eq!(inner.views[0].state, "allowing");
    assert!(inner.current("A", 1, generation));
    assert!(!inner.current("B", 1, generation));
}

#[test]
fn a_new_session_with_the_same_bearer_invalidates_pending_views() {
    let mut inner = Inner::default();
    inner.scope("A", 1);
    let generation = inner.generation;
    inner.views[0].state = "allowing";
    inner.scope("A", 2);
    assert!(!inner.current("A", 1, generation));
    assert!(inner.views.iter().all(|v| v.state != "allowing"));
}

#[test]
fn cancelling_clears_busy_state_and_a_late_old_job_cannot_reset_a_new_one() {
    let mut inner = Inner::default();
    inner.scope("A", 1);
    let old = inner.generation;
    let cancel = Arc::new(AtomicBool::new(false));
    inner.job = Some(Job {
        generation: old,
        cancel: cancel.clone(),
    });
    inner.views[0].state = "sending";
    inner.cancel_generation(old);
    assert!(cancel.load(Ordering::SeqCst));
    assert!(inner.job.is_none());
    assert!(inner.views.iter().all(|v| v.state != "sending"));
    inner.views[0].state = "allowing";
    inner.cancel_generation(old);
    assert_eq!(inner.views[0].state, "allowing");
}
