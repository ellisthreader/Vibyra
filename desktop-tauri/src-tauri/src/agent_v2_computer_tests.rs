use super::*;

const FP: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

fn action(tool: &str, arguments: Value) -> Value {
    json!({"id": "11111111-2222-4333-8444-555555555555", "tool": tool, "workspaceId": "ws",
        "state": "dispatching", "claimedGeneration": 3, "fingerprint": FP,
        "arguments": arguments, "expiresAt": 1_900_000_000})
}

#[test]
fn only_granted_computer_tools_map_to_the_existing_primitives() {
    assert_eq!(map("workspace_list"), Some(Op::Read("list_files")));
    assert_eq!(map("workspace_read"), Some(Op::Read("read_file")));
    assert_eq!(map("workspace_search"), Some(Op::Read("search_files")));
    assert_eq!(
        map("workspace_changes"),
        Some(Op::Read("git_publish_preview"))
    );
    assert_eq!(map("workspace_edit"), Some(Op::Edit));
    assert_eq!(map("run_test"), Some(Op::Test));
    assert_eq!(map("publish_branch"), Some(Op::Publish));
    // The draft PR is a server-side GitHub step; connector tools never reach the Mac.
    for tool in [
        "open_draft_pr",
        "gmail_send",
        "write_file",
        "git_status",
        "",
    ] {
        assert_eq!(map(tool), None, "{tool}");
    }
    assert!(!Op::Read("read_file").is_write());
    assert!(Op::Edit.is_write() && Op::Test.is_write() && Op::Publish.is_write());
}

#[test]
fn the_v1_request_carries_the_claim_run_and_exact_arguments() {
    let edit = action(
        "workspace_edit",
        json!({"path": "notes.txt", "content": "x", "expectedSha256": "new"}),
    );
    let request = v1_request(Op::Edit, &edit, "run-1");
    assert_eq!(request["operation"], "write_file");
    assert_eq!(request["turnId"], "run-1");
    assert_eq!(
        request["approval"],
        json!({"state": "dispatching", "fingerprint": FP})
    );
    assert_eq!(request["arguments"]["path"], "notes.txt");
    assert_eq!(request["expiresAt"].as_i64(), Some(1_900_000_000));
    // A no-argument preview must be `{}` on the wire, never `[]` or null.
    let preview = v1_request(
        Op::Read("git_publish_preview"),
        &action("workspace_changes", json!([])),
        "r",
    );
    assert_eq!(preview["arguments"], json!({}));
    let test = action(
        "run_test",
        json!({"script": "t.sh", "files": [{"path": "t.sh", "sha256": "a".repeat(64)}],
        "timeoutSeconds": 30}),
    );
    let request = v1_request(Op::Test, &test, "r");
    // The VM request shape is not part of this build; the mapping still names the operation.
    assert_eq!(request["operation"], "run_test");
}

#[test]
fn a_claim_belongs_to_one_lease_generation() {
    let mine = action("workspace_read", json!({"path": "a"}));
    assert!(claimed_by(&mine, 3));
    assert!(
        !claimed_by(&mine, 4),
        "a later lease never inherits a claim"
    );
    let mut approved = mine.clone();
    approved["state"] = json!("approved");
    assert!(!claimed_by(&approved, 3));
}

#[test]
fn receipts_carry_the_diff_fingerprint_output_digest_or_exact_upload() {
    let written = json!({"written": true, "path": "notes.txt", "sha256": "b".repeat(64), "binding": "internal"});
    let receipt = edit_receipt(written, Some("d".repeat(64)));
    assert_eq!(receipt["snapshotSha256"], "d".repeat(64));
    assert!(
        receipt.get("binding").is_none(),
        "only the fields the backend checks"
    );
    assert_eq!(
        edit_receipt(json!({"error": "stale file"}), None),
        json!({"error": "stale file"})
    );

    let test = test_receipt(
        json!({"script": "t.sh", "files": [], "snapshot": "c".repeat(64),
        "exitCode": 0, "timedOut": false, "output": "ok\n"}),
    );
    assert_eq!(
        test["outputSha256"],
        format!("{:x}", Sha256::digest(b"ok\n"))
    );
    assert_eq!(
        test_receipt(json!({"error": "stopped"})),
        json!({"error": "stopped"})
    );

    assert_eq!(
        publish_receipt(Ok(json!({"branch": "b"}))),
        json!({"upload": {"branch": "b"}})
    );
    assert_eq!(
        publish_receipt(Err("changed".into())),
        json!({"error": "changed"})
    );
    assert_eq!(
        read_receipt(json!({"error": "x", "extra": 1})),
        json!({"error": "x"})
    );
    assert_eq!(
        refusal("é".repeat(500))["error"]
            .as_str()
            .unwrap()
            .chars()
            .count(),
        400
    );
}
