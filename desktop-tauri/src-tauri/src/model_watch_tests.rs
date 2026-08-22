use std::collections::BTreeSet;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::thread;

use crate::model_watch::{
    apply_fresh, diff_new, pending_models, RawModel, ReleasedModel, WatchStore,
};
use crate::model_watch_discord::notify_models;

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

#[test]
fn legacy_store_loads_with_an_empty_delivery_queue() {
    let store: WatchStore = serde_json::from_str(r#"{"known":["openai/gpt-5.7"]}"#).unwrap();
    assert!(store.pending.is_empty());
}

#[test]
fn fresh_models_remain_pending_until_delivery_is_acknowledged() {
    let mut store = WatchStore::default();
    let fresh = [ReleasedModel {
        id: "openai/gpt-5.7".into(),
        name: "OpenAI: GPT-5.7".into(),
    }];
    apply_fresh(&mut store, &fresh);
    assert!(store.known.contains("openai/gpt-5.7"));
    assert_eq!(pending_models(&store)[0].name, "OpenAI: GPT-5.7");
}

#[test]
fn discord_delivery_requires_a_success_status() {
    let webhook = serve_once("401 Unauthorized");
    let result = tauri::async_runtime::block_on(notify_models(&webhook, &sample_models()));
    assert!(result.unwrap_err().contains("HTTP 401"));
}

#[test]
fn discord_delivery_accepts_no_content() {
    let webhook = serve_once("204 No Content");
    tauri::async_runtime::block_on(notify_models(&webhook, &sample_models())).unwrap();
}

fn sample_models() -> [ReleasedModel; 1] {
    [ReleasedModel {
        id: "openai/gpt-5.7".into(),
        name: "OpenAI: GPT-5.7".into(),
    }]
}

fn serve_once(status: &'static str) -> String {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let mut request = [0_u8; 4096];
        let _ = stream.read(&mut request);
        write!(
            stream,
            "HTTP/1.1 {status}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
        )
        .unwrap();
    });
    format!("http://{address}")
}
