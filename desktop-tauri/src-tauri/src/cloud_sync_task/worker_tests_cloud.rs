//! Polling, announcing, quiet apply and removing closed projects, against the fake rig.

use super::worker_rig::*;

#[test]
fn cloud_changes_are_polled_every_minute_and_announced_once() {
    let mut r = rig(&["a"]);
    r.settle();
    assert_eq!(r.count("poll"), 1);
    r.fake.polls.lock().push_back(Ok(vec![change("a", 3)]));
    r.advance(POLL_MS + 1);
    assert_eq!(r.count("poll"), 2);
    let notices = |events: &[Event]| -> Vec<ChangeNotice> {
        events
            .iter()
            .filter_map(|e| {
                if let Event::Changes(n) = e {
                    Some(n.clone())
                } else {
                    None
                }
            })
            .flatten()
            .collect()
    };
    let first = notices(&r.events.lock());
    assert_eq!(first.len(), 1);
    assert_eq!((first[0].project_id.as_str(), first[0].seq), ("a", 3));
    // The same snapshot offered again is not announced twice; a newer one is.
    r.fake.polls.lock().push_back(Ok(vec![change("a", 3)]));
    r.advance(POLL_MS + 1);
    r.fake.polls.lock().push_back(Ok(vec![change("a", 4)]));
    r.advance(POLL_MS + 1);
    let all = notices(&r.events.lock());
    assert_eq!(all.iter().map(|n| n.seq).collect::<Vec<_>>(), vec![3, 4]);
}

#[test]
fn a_clean_change_is_applied_quietly_only_when_the_user_allowed_it() {
    let mut r = rig(&["a"]);
    *r.fake.auto.lock() = Some(AutoApply::Applied(2));
    r.settle();
    r.fake.polls.lock().push_back(Ok(vec![change("a", 1)]));
    r.advance(POLL_MS + 1);
    assert_eq!(
        r.events
            .lock()
            .iter()
            .filter(|e| matches!(e, Event::Changes(_)))
            .count(),
        1,
        "default off: it is announced for review"
    );

    r.cfg.lock().sync.auto_apply_safe = true;
    r.fake.polls.lock().push_back(Ok(vec![change("a", 2)]));
    r.advance(POLL_MS + 1);
    assert_eq!(
        r.events
            .lock()
            .iter()
            .filter(|e| matches!(e, Event::Changes(_)))
            .count(),
        1,
        "applied cleanly: no review notice"
    );

    *r.fake.auto.lock() = Some(AutoApply::NeedsReview);
    r.fake.polls.lock().push_back(Ok(vec![change("a", 3)]));
    r.advance(POLL_MS + 1);
    assert_eq!(
        r.events
            .lock()
            .iter()
            .filter(|e| matches!(e, Event::Changes(_)))
            .count(),
        2,
        "not clean: back to a review"
    );
}

#[test]
fn a_project_removed_from_settings_is_removed_from_the_cloud_after_a_grace() {
    let mut r = rig(&["a", "b"]);
    r.settle();
    r.cfg.lock().projects.retain(|p| p.id != "b");
    r.advance(1_000);
    assert_eq!(
        r.count("remove"),
        0,
        "not at the first sight of its absence"
    );
    r.advance(SWEEP_MS + 1_000);
    assert_eq!(
        r.count("remove"),
        0,
        "nor until it has been gone for a full grace"
    );
    r.advance(SWEEP_MS + 1_000);
    assert_eq!(r.calls().iter().filter(|c| *c == "remove b").count(), 1);
    r.advance(SWEEP_MS + 1_000);
    assert_eq!(r.count("remove"), 1, "and only once");
    assert_eq!(r.count("remove a"), 0);
}

#[test]
fn an_empty_project_list_after_a_restart_never_wipes_the_cloud() {
    let mut r = rig(&[]);
    r.fake.known.lock().push(project("old"));
    r.settle();
    r.advance(SWEEP_MS * 3);
    assert_eq!(r.count("remove"), 0);
}

#[test]
fn switching_a_project_off_keeps_its_cloud_copy() {
    let mut r = rig(&["a"]);
    r.settle();
    r.cfg.lock().sync.set_project("a", false);
    r.advance(SWEEP_MS * 3);
    assert_eq!(r.count("remove"), 0);
}
