//! The shared corpus, `docs/secret-guard-vectors.json`, is what keeps this
//! module and `SecretGuard.php` the same. A failure here means the twin
//! diverges: fix the twin, not the vectors.

use super::*;
use serde_json::Value;

fn corpus() -> Value {
    serde_json::from_str(include_str!(
        "../../../../../../docs/secret-guard-vectors.json"
    ))
    .expect("corpus parses")
}

fn strings(value: &Value) -> Vec<String> {
    value
        .as_array()
        .expect("array")
        .iter()
        .map(|v| v.as_str().expect("string").to_owned())
        .collect()
}

#[test]
fn redact_vectors_match_the_backend() {
    let corpus = corpus();
    let vectors = corpus["redact"].as_array().expect("redact");
    assert!(!vectors.is_empty());
    for v in vectors {
        let (name, input) = (v["name"].as_str().unwrap(), v["input"].as_str().unwrap());
        assert_eq!(
            redact(input),
            v["output"].as_str().unwrap(),
            "redact: {name}"
        );
        assert_eq!(scan(input), strings(&v["kinds"]), "kinds: {name}");
        assert!(contains(input), "contains: {name}");
    }
}

#[test]
fn clean_vectors_are_left_alone() {
    let corpus = corpus();
    let vectors = corpus["clean"].as_array().expect("clean");
    assert!(!vectors.is_empty());
    for v in vectors {
        let (name, input) = (v["name"].as_str().unwrap(), v["input"].as_str().unwrap());
        assert_eq!(redact(input), input, "clean: {name}");
        assert!(scan(input).is_empty(), "kinds: {name}");
        assert!(!contains(input), "contains: {name}");
    }
}

#[test]
fn json_vectors_match_the_backend() {
    let corpus = corpus();
    let vectors = corpus["json"].as_array().expect("json");
    assert!(!vectors.is_empty());
    for v in vectors {
        let name = v["name"].as_str().unwrap();
        assert_eq!(
            redact_value(v["input"].clone()),
            v["output"],
            "json redact: {name}"
        );
        assert_eq!(
            kinds_in(&v["input"]),
            strings(&v["kinds"]),
            "json kinds: {name}"
        );
    }
}

#[test]
fn path_vectors_match_the_backend() {
    let corpus = corpus();
    let (sensitive, allowed) = (
        strings(&corpus["paths"]["sensitive"]),
        strings(&corpus["paths"]["allowed"]),
    );
    assert!(!sensitive.is_empty() && !allowed.is_empty());
    for path in sensitive {
        assert!(sensitive_path(&path), "should be sensitive: {path}");
    }
    for path in allowed {
        assert!(!sensitive_path(&path), "should be allowed: {path}");
    }
}

#[test]
fn oversized_text_is_cut_and_marked() {
    let text = "a".repeat(MAX_BYTES + 10);
    let out = redact(&text);
    assert_eq!(out.len(), MAX_BYTES + "[redacted:truncated]".len());
    assert!(out.ends_with("[redacted:truncated]"));
}

#[test]
fn a_cut_through_a_character_never_panics() {
    let text = format!("{}{}", "a".repeat(MAX_BYTES - 1), "é".repeat(3));
    assert!(redact(&text).ends_with("[redacted:truncated]"));
}

#[test]
fn an_unterminated_private_key_loses_everything_after_it() {
    let out = redact("before\n-----BEGIN RSA PRIVATE KEY-----\nMIIEabc\nmore");
    assert_eq!(out, "before\n[redacted:private_key]");
}
