//! Pausing, crashing, and the fields a routine cannot be saved without.

use chrono::{Duration, Utc};

use super::*;
use crate::agentdb::AgentDb;

fn seeded() -> AgentDb {
    let db = AgentDb::open_memory().unwrap();
    db.with(|connection| {
        connection
            .execute(
                "INSERT INTO agent_profiles \
                 (id, account, name, engine, home_path, created_ms, updated_ms) \
                 VALUES ('a', 'acct', 'Nia', 'claude', '/tmp/a', 1, 1)",
                [],
            )
            .unwrap();
        Ok(())
    })
    .unwrap();
    db
}

fn draft() -> RoutineDraft {
    RoutineDraft {
        agent_id: "a".into(),
        name: "Morning check".into(),
        instruction: "Summarise what changed overnight.".into(),
        schedule: Schedule::Daily {
            minute_of_day: 9 * 60,
        },
        timezone: "Europe/London".into(),
        permission: None,
    }
}

/// Pausing stops it; resuming recomputes from now, so a routine paused for a
/// month does not fire the instant it comes back.
#[test]
fn resuming_recomputes_rather_than_firing_immediately() {
    let db = seeded();
    let routine = create(&db, draft()).unwrap();

    let paused = set_enabled(&db, &routine.id, false).unwrap();
    assert!(!paused.enabled && paused.next_run_ms.is_none());
    assert_eq!(
        due(&paused, Utc::now() + Duration::days(30), false, true),
        Due::Wait
    );

    let resumed = set_enabled(&db, &routine.id, true).unwrap();
    assert!(resumed.enabled);
    assert!(resumed.next_run_ms.unwrap() > Utc::now().timestamp_millis());
}

/// A crash leaves rows marked running that no process is behind.
#[test]
fn runs_left_running_by_a_crash_are_closed_on_load() {
    let db = seeded();
    let routine = create(&db, draft()).unwrap();
    runs::begin(&db, &routine.id, None, routine.next_run_ms.unwrap()).unwrap();
    assert_eq!(runs::in_flight(&db).unwrap().len(), 1);

    assert_eq!(runs::reset_running(&db).unwrap(), 1);
    assert!(runs::in_flight(&db).unwrap().is_empty());
    assert_eq!(
        runs::history(&db, &routine.id, 10).unwrap()[0].status,
        "failed"
    );
}

/// A routine that cannot describe what it does each time is not a routine.
#[test]
fn a_routine_needs_a_name_an_instruction_and_a_real_timezone() {
    let db = seeded();
    assert!(create(
        &db,
        RoutineDraft {
            name: "  ".into(),
            ..draft()
        }
    )
    .is_err());
    assert!(create(
        &db,
        RoutineDraft {
            instruction: "".into(),
            ..draft()
        }
    )
    .is_err());
    assert!(create(
        &db,
        RoutineDraft {
            timezone: "Mars/Olympus".into(),
            ..draft()
        }
    )
    .is_err());
    assert!(create(
        &db,
        RoutineDraft {
            schedule: Schedule::Every { minutes: 1 },
            ..draft()
        }
    )
    .is_err());
}
