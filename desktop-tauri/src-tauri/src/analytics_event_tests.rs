mod tests {
    use crate::analytics_event::{payload, Event};
    use serde_json::json;
    use std::collections::BTreeMap;

    #[test]
    fn rejects_private_metadata_and_invalid_duration() {
        for key in ["prompt", "path", "project_name", "url", "email"] {
            assert!(payload(
                Event::PromptSubmitted,
                BTreeMap::from([(key.into(), json!("secret"))]),
                None,
                "0.7.9"
            )
            .is_err());
        }
        assert!(payload(
            Event::EngagementInterval,
            BTreeMap::from([("seconds".into(), json!(61))]),
            None,
            "0.7.9"
        )
        .is_err());
        assert!(payload(
            Event::EngagementInterval,
            BTreeMap::from([("seconds".into(), json!(20))]),
            None,
            "0.7.9"
        )
        .is_ok());
    }

    #[test]
    fn accepted_event_has_stable_id_and_no_content() {
        let id = "123e4567-e89b-42d3-a456-426614174000".to_owned();
        let value = payload(
            Event::TerminalStarted,
            BTreeMap::from([("provider".into(), json!("codex"))]),
            Some(id.clone()),
            "0.7.9",
        )
        .unwrap();
        assert_eq!(value["event_id"], id);
        assert_eq!(value["properties"]["provider"], "codex");
        assert!(value["properties"].get("path").is_none());
    }
    #[test]
    fn custom_agent_name_cannot_become_a_dimension() {
        let value = payload(
            Event::TerminalStarted,
            BTreeMap::from([
                ("provider".into(), json!("private_project_name")),
                ("model".into(), json!("mysecret")),
            ]),
            None,
            "0.7.9",
        )
        .unwrap();
        assert_eq!(value["properties"]["provider"], "other");
        assert!(value["properties"].get("model").is_none());
    }

    #[test]
    fn model_values_outside_backend_contract_are_removed() {
        for model in [
            format!("gpt-{}", "a".repeat(40)),
            "gpt-5..6".to_owned(),
            "openrouter/openai/gpt-5/extra".to_owned(),
        ] {
            let value = payload(
                Event::PromptSubmitted,
                BTreeMap::from([("model".into(), json!(model))]),
                None,
                "0.8.11",
            )
            .unwrap();
            assert!(value["properties"].get("model").is_none());
        }
        let value = payload(
            Event::PromptSubmitted,
            BTreeMap::from([("model".into(), json!("openrouter/openai/gpt-5"))]),
            None,
            "0.8.11",
        )
        .unwrap();
        assert_eq!(value["properties"]["model"], "openai/gpt-5");
    }
}
