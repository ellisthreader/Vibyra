//! The two ordering rules `flush_due` relies on, pinned as pure unit tests.
//! Timing them at the integration level would measure drift, not the rule.

use super::{delivery_priority, epoch, Visibility};
use std::time::{Duration, Instant};

#[test]
fn the_focused_pane_is_handed_to_the_renderer_first() {
    // Ordering only shows up as latency, never as wrong output, so it has
    // no natural assertion at the integration level — and timing one is
    // measuring drift, not order. The rule itself is the thing to pin.
    let mut tiers = [
        Visibility::Hibernated,
        Visibility::Hidden,
        Visibility::Background,
        Visibility::Visible,
    ];
    tiers.sort_by_key(|visibility| delivery_priority(*visibility));
    assert_eq!(
        tiers,
        [
            Visibility::Visible,
            Visibility::Background,
            Visibility::Hidden,
            Visibility::Hibernated,
        ],
        "the pane holding the keyboard must be delivered before any paced one",
    );
}

#[test]
fn paced_sessions_share_epoch_boundaries_instead_of_drifting() {
    let origin = Instant::now();
    let interval = Duration::from_millis(75);
    // Two sessions that last delivered at different moments inside the
    // same period still both become due when the next boundary passes:
    // the epoch is a property of the shared clock, not of the session.
    let a = origin + Duration::from_millis(10);
    let b = origin + Duration::from_millis(60);
    let later = origin + Duration::from_millis(80);
    assert_eq!(epoch(origin, a, interval), epoch(origin, b, interval));
    assert!(epoch(origin, later, interval) > epoch(origin, a, interval));
    assert!(epoch(origin, later, interval) > epoch(origin, b, interval));
}
