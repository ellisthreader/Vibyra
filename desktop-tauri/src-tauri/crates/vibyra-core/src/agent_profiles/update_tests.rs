use super::AgentUpdate;

#[test]
fn partial_updates_distinguish_missing_set_and_clear() {
    let absent: AgentUpdate = serde_json::from_str("{}").unwrap();
    assert_eq!(absent.model, None);
    assert_eq!(absent.effort, None);
    let clear: AgentUpdate = serde_json::from_str(r#"{"model":null,"effort":null}"#).unwrap();
    assert_eq!(clear.model, Some(None));
    assert_eq!(clear.effort, Some(None));
    let set: AgentUpdate = serde_json::from_str(r#"{"model":"chosen","effort":"high"}"#).unwrap();
    assert_eq!(set.model, Some(Some("chosen".into())));
    assert_eq!(set.effort, Some(Some("high".into())));
}
