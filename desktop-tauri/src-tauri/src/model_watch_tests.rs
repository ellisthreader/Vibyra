use std::collections::BTreeSet;

use crate::model_watch::{diff_new, RawModel};

fn raw(id: &str, name: &str) -> RawModel {
    RawModel {
        id: id.into(),
        name: name.into(),
    }
}

#[test]
fn variants_are_not_releases() {
    let known: BTreeSet<String> = ["anthropic/claude-opus-5".to_string()].into();
    let current = [
        raw("anthropic/claude-opus-5", "Claude Opus 5"),
        raw("anthropic/claude-opus-5:batch", "Claude Opus 5 (batch)"),
    ];
    assert!(diff_new(&known, &current).is_empty());
}

#[test]
fn new_model_reported_once_across_variants() {
    let known = BTreeSet::new();
    let current = [
        raw("openai/gpt-5.7", "OpenAI: GPT-5.7"),
        raw("openai/gpt-5.7:batch", "OpenAI: GPT-5.7 (batch)"),
    ];
    let fresh = diff_new(&known, &current);
    assert_eq!(fresh.len(), 1);
    assert_eq!(fresh[0].id, "openai/gpt-5.7");
    assert_eq!(fresh[0].name, "OpenAI: GPT-5.7");
}
