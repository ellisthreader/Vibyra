mod tests {
    use crate::analytics_store::{AnalyticsStore, Choice};
    use serde_json::json;

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
}
