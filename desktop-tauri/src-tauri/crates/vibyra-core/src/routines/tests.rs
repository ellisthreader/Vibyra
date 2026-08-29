use chrono::{DateTime, Duration, Utc};

use super::*;
use crate::agent_model::PermissionMode;
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

fn at(routine: &Routine, offset_minutes: i64) -> DateTime<Utc> {
    DateTime::from_timestamp_millis(routine.next_run_ms.unwrap()).unwrap()
        + Duration::minutes(offset_minutes)
}

/// A standing schedule that can write is something changing files while nobody
/// watches, so raising it has to be a separate, deliberate choice.
#[test]
fn a_routine_defaults_to_plan_rather_than_inheriting_write_access() {
    let db = seeded();
    let routine = create(&db, draft()).unwrap();
    assert_eq!(routine.permission, PermissionMode::Plan);

    let explicit = create(
        &db,
        RoutineDraft {
            permission: Some(PermissionMode::Standard),
            ..draft()
        },
    )
    .unwrap();
    assert_eq!(explicit.permission, PermissionMode::Standard);
}

/// The rule and the sentence describing it are resolved together, so they
/// cannot drift apart in the UI.
#[test]
fn a_saved_routine_carries_its_own_description_and_next_run() {
    let db = seeded();
    let routine = create(&db, draft()).unwrap();
    assert_eq!(routine.description, "Every day at 09:00");
    assert!(routine.next_run_ms.unwrap() > Utc::now().timestamp_millis());

    let reloaded = get(&db, &routine.id).unwrap();
    assert_eq!(reloaded.description, routine.description);
    assert_eq!(reloaded.schedule, routine.schedule);
    assert_eq!(reloaded.timezone, "Europe/London");
}

/// The policy this module exists for. A week offline must not fire a week of
/// standups the moment the app opens.
#[test]
fn a_week_offline_skips_the_missed_run_rather_than_bursting() {
    let db = seeded();
    let routine = create(&db, draft()).unwrap();

    assert_eq!(due(&routine, at(&routine, -1), false), Due::Wait);
    assert_eq!(due(&routine, at(&routine, 1), false), Due::Run);
    assert_eq!(
        due(&routine, at(&routine, 10), false),
        Due::Run,
        "slightly late still runs"
    );
    assert_eq!(due(&routine, at(&routine, 60), false), Due::Skip);
    assert_eq!(due(&routine, at(&routine, 60 * 24 * 7), false), Due::Skip);
}

/// One run per routine at a time, and a cap across all of them, so a tick
/// cannot saturate the machine beside whatever the user is doing.
#[test]
fn a_routine_never_runs_twice_at_once_and_a_tick_is_capped() {
    let db = seeded();
    let routine = create(&db, draft()).unwrap();
    assert_eq!(due(&routine, at(&routine, 1), true), Due::Wait);

    for index in 0..6 {
        let mut extra = draft();
        extra.name = format!("Check {index}");
        extra.schedule = Schedule::Every { minutes: 5 };
        create(&db, extra).unwrap();
    }
    let (to_run, _) = plan_tick(&db, Utc::now() + Duration::minutes(6)).unwrap();
    assert!(
        to_run.len() <= runs::MAX_CONCURRENT,
        "started {} at once",
        to_run.len()
    );
}

/// A skipped run is still a row: a gap in the history is indistinguishable
/// from a routine that was never scheduled.
#[test]
fn a_skipped_run_is_recorded_and_the_schedule_moves_on() {
    let db = seeded();
    let routine = create(&db, draft()).unwrap();
    let was = routine.next_run_ms.unwrap();

    runs::skip(&db, &routine.id, was).unwrap();
    runs::advance_past(&db, &routine.id, at(&routine, 1)).unwrap();

    let history = runs::history(&db, &routine.id, 10).unwrap();
    assert_eq!(history.len(), 1);
    assert_eq!(history[0].status, "skipped");
    assert!(history[0].error.as_ref().unwrap().contains("not running"));
    assert!(
        get(&db, &routine.id).unwrap().next_run_ms.unwrap() > was,
        "still due forever"
    );
}
