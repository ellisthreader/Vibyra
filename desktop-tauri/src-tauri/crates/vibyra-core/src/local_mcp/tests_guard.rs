use super::guard::{path_arguments, redact_result, refusal, server_folder};
use super::{CallResult, ServerSpec};
use crate::secret_guard::allow::set_allowed;
use serde_json::json;

const FAKE_KEY: &str = "sk-ant-api03-FAKEFAKEFAKEFAKEFAKEFAKE1234";

fn spec(folder: &std::path::Path) -> ServerSpec {
    ServerSpec {
        args: vec![
            "-y".into(),
            "server-filesystem".into(),
            folder.to_string_lossy().into_owned(),
        ],
        ..ServerSpec::default()
    }
}

#[test]
fn path_like_arguments_are_found_in_strings_and_arrays() {
    let args = json!({"path": "a.txt", "paths": ["b.txt", "c.txt"], "source": "s", "destination": "d",
        "filePath": "f", "Directory": "dir", "pattern": "id_rsa", "content": ".env"});
    let found = path_arguments(&args);
    for expected in ["a.txt", "b.txt", "c.txt", "s", "d", "f", "dir"] {
        assert!(found.contains(&expected), "{expected}");
    }
    assert!(!found.contains(&"id_rsa") && !found.contains(&".env"));
}

#[test]
fn the_folder_is_the_working_folder_or_the_last_absolute_argument() {
    let dir = tempfile::tempdir().unwrap();
    assert_eq!(server_folder(&spec(dir.path())), dir.path().to_str());
    let mut with_cwd = spec(dir.path());
    with_cwd.cwd = Some("/work".into());
    assert_eq!(server_folder(&with_cwd), Some("/work"));
}

#[test]
fn sensitive_files_are_refused_and_normal_ones_are_not() {
    let (settings, project) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
    let spec = spec(project.path());
    for call in [
        json!({"path": ".env"}),
        json!({"paths": ["a.txt", "keys/id_rsa"]}),
        json!({"source": "x.pem", "destination": "y.txt"}),
    ] {
        assert!(refusal(settings.path(), &spec, &call).is_some(), "{call}");
    }
    for call in [
        json!({"path": "src/main.rs"}),
        json!({"pattern": ".env"}),
        json!({}),
    ] {
        assert!(refusal(settings.path(), &spec, &call).is_none(), "{call}");
    }
}

#[test]
fn an_allowed_folder_permits_sensitive_files() {
    let (settings, project) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
    set_allowed(settings.path(), project.path().to_str().unwrap(), true).unwrap();
    assert!(refusal(
        settings.path(),
        &spec(project.path()),
        &json!({"path": ".env"})
    )
    .is_none());
}

#[test]
fn result_text_and_structured_content_are_redacted_within_bounds() {
    let result = CallResult {
        text: format!("token {FAKE_KEY} end"),
        structured: Some(json!({"note": format!("k {FAKE_KEY}"), "n": 1})),
        is_error: false,
        truncated: false,
    };
    let out = redact_result(result);
    assert_eq!(out.text, "token [redacted:anthropic_key] end");
    assert_eq!(
        out.structured.unwrap()["note"],
        "k [redacted:anthropic_key]"
    );
    let long = CallResult {
        text: "x".repeat(super::RESULT_TEXT_BYTES),
        structured: None,
        is_error: false,
        truncated: false,
    };
    assert_eq!(redact_result(long).text.len(), super::RESULT_TEXT_BYTES);
}
