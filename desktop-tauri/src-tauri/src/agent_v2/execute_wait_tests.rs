//! A usage-limit stop is posted as a `limits` pause carrying the provider's
//! reset time, so the backend parks the run instead of re-offering it.

use super::*;

#[test]
fn provider_errors_map_to_waiting_states() {
    let dir = tempfile::tempdir().unwrap();
    let limited = r#"{"type":"rate_limit_event","rate_limit_info":{"status":"rejected","resetsAt":1790000000}}"#;
    let error = r#"{"type":"result","subtype":"success","is_error":true,"result":"Claude AI usage limit reached"}"#;
    let plan = plan(dir.path(), &[INIT_OK, limited, error], &[]);
    let backend = Recorder::default();
    assert_eq!(
        execute(&plan, &backend, &Control::default()),
        Outcome::Failed("limits".into())
    );
    assert_eq!(calls(&backend), vec!["pause:Some(1790000000)".to_string()]);
}
