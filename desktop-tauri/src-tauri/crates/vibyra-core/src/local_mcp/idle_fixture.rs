//! Process death can become observable before the janitor publishes Stopped.
//! Wait for both under one deadline; this fixture never changes production state.
use std::time::{Duration, Instant};

pub(super) fn wait_for_stopped(wait: Duration, mut observe: impl FnMut() -> (bool, bool)) -> bool {
    let deadline = Instant::now() + wait;
    loop {
        let (dead, published) = observe();
        if dead && published {
            return true;
        }
        let Some(remaining) = deadline.checked_duration_since(Instant::now()) else {
            return false;
        };
        std::thread::sleep(remaining.min(Duration::from_millis(25)));
    }
}

#[test]
fn an_idle_server_is_stopped_and_starts_again_on_next_use() {
    use super::*;
    if !node_available() {
        return;
    }
    let limits = Limits {
        idle_stop: Duration::from_millis(400),
        ..quick()
    };
    let sup = supervisor(limits, Arc::default());
    sup.spawn_janitor();
    let spec = spec("idle", "");
    let first = pid(&sup, &spec);
    assert!(
        wait_for_stopped(Duration::from_secs(4), || {
            (!alive(first), sup.status(&spec.id).state == State::Stopped)
        }),
        "idle process death and Stopped publication must both complete"
    );
    assert_eq!(sup.status(&spec.id).state, State::Stopped);
    assert_ne!(pid(&sup, &spec), first);
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn process_death_before_state_publication_is_not_completion() {
        let mut observations = 0;
        assert!(wait_for_stopped(Duration::from_secs(1), || {
            observations += 1;
            match observations {
                1 => (false, false),
                2 => (true, false),
                _ => (true, true),
            }
        }));
        assert_eq!(
            observations, 3,
            "must observe published state after process death"
        );
    }
    #[test]
    fn expired_budget_refuses_either_missing_observation() {
        for pending in [(true, false), (false, true), (false, false)] {
            assert!(!wait_for_stopped(Duration::ZERO, || pending));
        }
    }
    #[test]
    fn completed_stop_needs_no_extra_delay() {
        let mut observations = 0;
        assert!(wait_for_stopped(Duration::ZERO, || {
            observations += 1;
            (true, true)
        }));
        assert_eq!(observations, 1);
    }
}
