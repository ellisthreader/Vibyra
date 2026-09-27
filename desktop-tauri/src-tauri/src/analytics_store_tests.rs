mod tests {
    use crate::analytics_event::{payload, Event};
    use crate::analytics_store::{AnalyticsStore, Choice};
    use serde_json::json;
    use std::collections::BTreeMap;

    #[test]
    fn unknown_and_other_accounts_never_replay_saved_events() {
        let dir = tempfile::tempdir().unwrap();
        let store = AnalyticsStore::load(dir.path().join("analytics.json"));
        assert!(!store.enqueue("a", json!({"event_id":"1"})));
        store.bind("a");
        store.set_verified("a", Choice::Aggregate);
        assert!(store.enqueue("a", json!({"event_id":"1"})));
        assert_eq!(store.first("a").unwrap()["consent_mode"], "aggregate");
        assert_eq!(store.bind("b").choice, Choice::Unknown);
        assert!(store.first("b").is_none());
    }

    #[test]
    fn withdrawal_purges_queue_and_survives_restart_without_enabling_collection() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("analytics.json");
        let store = AnalyticsStore::load(path.clone());
        store.bind("a");
        store.set_verified("a", Choice::Linked);
        store.enqueue("a", json!({"event_id":"1"}));
        assert_eq!(store.first("a").unwrap()["consent_mode"], "linked");
        store.decline_now("a");
        assert!(store.first("a").is_none());
        let restarted = AnalyticsStore::load(path);
        let status = restarted.bind("a");
        assert_eq!(status.choice, Choice::Declined);
        assert!(status.pending_decline);
    }

    #[test]
    fn consented_wire_events_have_only_server_allowlisted_fields() {
        let dir = tempfile::tempdir().unwrap();
        let store = AnalyticsStore::load(dir.path().join("analytics.json"));
        store.bind("account-a");
        store.set_verified("account-a", Choice::Linked);
        let cases = [
            (Event::AppOpened, BTreeMap::new()),
            (
                Event::ProjectCreated,
                BTreeMap::from([("project_kind".into(), json!("website"))]),
            ),
            (Event::ProjectOpened, BTreeMap::new()),
            (Event::PreviewOpened, BTreeMap::new()),
            (
                Event::TerminalStarted,
                BTreeMap::from([
                    ("provider".into(), json!("codex")),
                    ("model".into(), json!("gpt-5.6-codex")),
                ]),
            ),
            (
                Event::PromptSubmitted,
                BTreeMap::from([
                    ("provider".into(), json!("codex")),
                    ("model".into(), json!("gpt-5.6-codex")),
                ]),
            ),
            (
                Event::EngagementInterval,
                BTreeMap::from([("seconds".into(), json!(30))]),
            ),
        ];
        let mut wire = Vec::new();
        for (event, properties) in cases {
            let body = payload(event, properties, None, "0.8.11").unwrap();
            assert!(store.enqueue("account-a", body));
            let sent = store.first("account-a").unwrap();
            assert_eq!(sent["surface"], "desktop");
            assert_eq!(sent["consent_mode"], "linked");
            assert!(sent.get("prompt").is_none());
            store.remove_first("account-a", sent["event_id"].as_str().unwrap());
            wire.push(sent);
        }
        println!("WIRE_EVENTS={}", serde_json::to_string(&wire).unwrap());
        store.decline_now("account-a");
        assert!(!store.enqueue("account-a", json!({"event_id":"after-withdrawal"})));
        assert!(store.first("account-a").is_none());
    }
}
