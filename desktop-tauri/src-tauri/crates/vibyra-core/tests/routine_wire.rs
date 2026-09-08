use serde_json::{json, Value};
use vibyra_core::{agent_profiles, agentdb::AgentDb, routines};

#[test]
fn renderer_schedules_create_edit_and_reopen_with_the_same_wire_shape() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("agents.db");
    let db = AgentDb::open(&path).unwrap();
    let agent = agent_profiles::create(
        &db,
        "wire-check",
        root.path(),
        serde_json::from_value(json!({"name":"Scheduler", "brief":"", "engine":"claude"})).unwrap(),
    )
    .unwrap();
    for schedule in [
        json!({"kind":"daily", "minuteOfDay":540}),
        json!({"kind":"weekdays", "days":[0,2,4], "minuteOfDay":815}),
        json!({"kind":"every", "minutes":15}),
    ] {
        let payload = json!({"agentId":agent.id, "name":"Wire check", "instruction":"Report only",
            "schedule":schedule, "timezone":"Europe/London", "permission":"plan"});
        let draft =
            serde_json::from_value(payload.clone()).expect("renderer draft must deserialize");
        let saved = routines::create(&db, draft).unwrap();
        assert_eq!(serde_json::to_value(&saved).unwrap()["schedule"], schedule);
        let mut changed = payload;
        changed["name"] = json!("Edited check");
        routines::set_enabled(&db, &saved.id, false).unwrap();
        routines::update(&db, &saved.id, serde_json::from_value(changed).unwrap()).unwrap();
        let reopened = AgentDb::open(&path).unwrap();
        let loaded = routines::get(&reopened, &saved.id).unwrap();
        assert_eq!(loaded.name, "Edited check");
        assert!(!loaded.enabled);
        assert_eq!(serde_json::to_value(loaded).unwrap()["schedule"], schedule);
    }
}

#[test]
fn legacy_saved_schedules_remain_readable_and_return_camel_case() {
    for kind in ["daily", "weekdays"] {
        let legacy = json!({"kind":kind, "days":[1,3], "minute_of_day":600});
        let schedule: routines::Schedule = serde_json::from_value(legacy).unwrap();
        let current = serde_json::to_value(schedule).unwrap();
        assert_eq!(current["minuteOfDay"], 600);
        assert_eq!(current["minute_of_day"], Value::Null);
        let restored: routines::Schedule = serde_json::from_value(current).unwrap();
        assert!(restored.valid().is_ok());
    }
}
