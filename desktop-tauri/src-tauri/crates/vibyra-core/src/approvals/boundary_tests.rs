use super::*;

#[test]
fn effectful_forms_are_never_classified_as_read_only() {
    for command in [
        "sed -n '1w output' input",
        "sort -o output input",
        "uniq input output",
        "git tag new-tag",
        "git stash",
        "git remote add target https://example.invalid",
        "git branch new-branch",
        "find . -fprint output",
        "git diff --output=output",
    ] {
        assert_ne!(bash_risk(command), Risk::Read, "{command}");
    }
    assert_ne!(
        classify("Task", &serde_json::json!({"prompt":"change a file"})).risk,
        Risk::Read
    );
}

#[test]
fn approval_digest_includes_the_full_tool_payload() {
    let prefix = "x".repeat(3000);
    let a = classify(
        "mcp__service__update",
        &serde_json::json!({"body":format!("{prefix}a")}),
    );
    let b = classify(
        "mcp__service__update",
        &serde_json::json!({"body":format!("{prefix}b")}),
    );
    assert_ne!(a.detail, b.detail);
}
