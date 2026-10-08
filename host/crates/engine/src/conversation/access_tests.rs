use super::access::{access_level, apply_to_turn};
use serde_json::json;

#[test]
fn saved_chats_keep_the_access_they_launched_with() {
    assert_eq!(
        access_level(&json!({"provider":"codex","approvalPolicy":"on-request"})),
        "auto"
    );
    assert_eq!(
        access_level(&json!({"provider":"claude","approvalPolicy":"on-request"})),
        "ask"
    );
    assert_eq!(
        access_level(&json!({"provider":"gemini","approvalPolicy":"never"})),
        "full"
    );
    assert_eq!(
        access_level(&json!({"provider":"claude","access":"auto"})),
        "auto"
    );
    assert_eq!(
        access_level(&json!({"provider":"codex","access":"bogus"})),
        "auto"
    );
}

#[test]
fn codex_turns_carry_overrides_only_once_access_was_chosen() {
    let mut untouched = json!({});
    apply_to_turn(&json!({"provider":"codex","access":"auto"}), &mut untouched);
    assert_eq!(untouched, json!({}));
    let sandbox = json!({"type":"workspaceWrite","writableRoots":["/w"],"networkAccess":false});
    let mut full = json!({});
    apply_to_turn(
        &json!({"provider":"codex","access":"full","accessSet":true,"sandbox":sandbox}),
        &mut full,
    );
    assert_eq!(
        full,
        json!({"approvalPolicy":"never","sandboxPolicy":{"type":"dangerFullAccess"}})
    );
    let mut ask = json!({});
    apply_to_turn(
        &json!({"provider":"codex","access":"ask","accessSet":true,"sandbox":sandbox}),
        &mut ask,
    );
    assert_eq!(
        ask,
        json!({"approvalPolicy":"untrusted","sandboxPolicy":sandbox})
    );
    let mut back = json!({});
    apply_to_turn(
        &json!({"provider":"codex","access":"auto","accessSet":true,"sandbox":{"type":"dangerFullAccess"}}),
        &mut back,
    );
    assert_eq!(
        back,
        json!({"approvalPolicy":"on-request","sandboxPolicy":{"type":"workspaceWrite"}})
    );
}

#[test]
fn bridge_turns_always_name_their_access() {
    let mut turn = json!({});
    apply_to_turn(&json!({"provider":"claude","access":"full"}), &mut turn);
    assert_eq!(turn, json!({"access":"full"}));
}
