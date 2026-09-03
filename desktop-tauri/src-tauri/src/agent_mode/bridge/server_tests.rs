//! The bridge, driven the way Claude drives it: a handshake, a listing, then
//! a call — with the app on the far end stubbed.

use std::sync::Mutex;

use serde_json::{json, Value};

use super::server::handle;
use super::wire::{BridgeReply, BridgeRequest, Env, Wire};

struct Recording {
    asked: Mutex<Vec<BridgeRequest>>,
    answer: BridgeReply,
}

impl Wire for Recording {
    fn ask(&self, request: BridgeRequest) -> BridgeReply {
        self.asked.lock().unwrap().push(request);
        self.answer.clone()
    }
}

fn env() -> Env {
    Env {
        port: 1,
        token: "tok".into(),
        chat_id: "chat-9".into(),
        turn_id: "turn-3".into(),
    }
}

fn parsed(line: Option<String>) -> Value {
    serde_json::from_str(&line.expect("a response")).unwrap()
}

#[test]
fn the_handshake_advertises_one_tool_and_ignores_notifications() {
    let wire = Recording {
        asked: Mutex::new(Vec::new()),
        answer: BridgeReply::allow(json!({})),
    };
    let init = parsed(handle(
        r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"claude","version":"2"}}}"#,
        &wire,
        &env(),
    ));
    assert_eq!(init["result"]["protocolVersion"], "2025-03-26");
    assert_eq!(init["result"]["serverInfo"]["name"], "vibyra");
    assert!(init["result"]["capabilities"]["tools"].is_object());

    assert!(
        handle(
            r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#,
            &wire,
            &env()
        )
        .is_none(),
        "a notification is never answered"
    );
    assert!(handle("", &wire, &env()).is_none());

    let list = parsed(handle(
        r#"{"jsonrpc":"2.0","id":2,"method":"tools/list"}"#,
        &wire,
        &env(),
    ));
    assert_eq!(list["result"]["tools"][0]["name"], "approve");
    assert_eq!(
        list["result"]["tools"][0]["inputSchema"]["required"][0],
        "tool_name"
    );

    let ping = parsed(handle(
        r#"{"jsonrpc":"2.0","id":3,"method":"ping"}"#,
        &wire,
        &env(),
    ));
    assert_eq!(ping["result"], json!({}));

    let unknown = parsed(handle(
        r#"{"jsonrpc":"2.0","id":4,"method":"resources/list"}"#,
        &wire,
        &env(),
    ));
    assert_eq!(unknown["error"]["code"], -32601);
    assert!(
        wire.asked.lock().unwrap().is_empty(),
        "nothing so far reached the app"
    );
}

/// The call carries exactly what Claude asked plus who is asking, and the
/// reply comes back as the JSON text Claude parses for its verdict.
#[test]
fn a_call_reaches_the_app_and_returns_its_verdict_as_text() {
    let wire = Recording {
        asked: Mutex::new(Vec::new()),
        answer: BridgeReply::deny("Not this time."),
    };
    let response = parsed(handle(
        r#"{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"approve","arguments":{"tool_name":"Bash","input":{"command":"git push"},"tool_use_id":"toolu_1"}}}"#,
        &wire,
        &env(),
    ));
    let asked = wire.asked.lock().unwrap();
    assert_eq!(asked.len(), 1);
    assert_eq!(asked[0].token, "tok");
    assert_eq!(asked[0].chat_id, "chat-9");
    assert_eq!(asked[0].turn_id, "turn-3");
    assert_eq!(asked[0].tool_name, "Bash");
    assert_eq!(asked[0].input, json!({"command": "git push"}));

    let text = response["result"]["content"][0]["text"].as_str().unwrap();
    let verdict: Value = serde_json::from_str(text).unwrap();
    assert_eq!(
        verdict,
        json!({"behavior": "deny", "message": "Not this time."})
    );
}

#[test]
fn allow_carries_the_input_back_under_claudes_key() {
    let reply = BridgeReply::allow(json!({"command": "ls"}));
    assert_eq!(
        serde_json::to_value(&reply).unwrap(),
        json!({"behavior": "allow", "updatedInput": {"command": "ls"}})
    );
}
