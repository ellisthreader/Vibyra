//! Process cleanup, environment sanitisation and secrets.

use super::tests_support::*;
use super::*;
use serde_json::json;
use std::sync::Arc;
use std::time::Duration;

#[test]
fn stopping_a_server_takes_what_it_started_and_reaps_it() {
    if !node_available() {
        return;
    }
    let sup = supervisor(quick(), Arc::default());
    let spec = spec("group", "");
    let server: i32 = text(&sup.call_tool(&spec, "pid", &json!({})).unwrap())
        .parse()
        .unwrap();
    let child: i32 = text(&sup.call_tool(&spec, "grandchild", &json!({})).unwrap())
        .parse()
        .unwrap();
    assert!(alive(child));
    sup.stop(&spec.id);
    assert!(
        gone_within(child, Duration::from_secs(3)),
        "the grandchild outlived the server"
    );
    assert!(!alive(server), "the server was reaped, not left a zombie");
}

#[test]
fn quitting_stops_every_server_and_dropping_the_supervisor_does_too() {
    if !node_available() {
        return;
    }
    let sup = supervisor(quick(), Arc::default());
    let spec = spec("quit", "");
    let child: i32 = {
        sup.call_tool(&spec, "pid", &json!({})).unwrap();
        text(&sup.call_tool(&spec, "grandchild", &json!({})).unwrap())
            .parse()
            .unwrap()
    };
    drop(sup);
    assert!(gone_within(child, Duration::from_secs(3)));
}

#[test]
fn a_server_sees_a_clean_allowlist_and_only_the_variables_the_person_set() {
    if !node_available() {
        return;
    }
    let keychain: Arc<FakeKeychain> = Arc::default();
    keychain
        .0
        .lock()
        .unwrap()
        .insert("test-env-0000/MY_TOKEN".into(), "tok-123".into());
    let sup = supervisor(quick(), keychain);
    let mut spec = spec("env", "");
    spec.env.insert("MY_SETTING".into(), "on".into());
    spec.secret_env.push("MY_TOKEN".into());
    let names = sup.call_tool(&spec, "env_names", &json!({})).unwrap().text;
    let names: Vec<&str> = names.split(',').collect();
    for wanted in ["PATH", "HOME", "MY_SETTING", "MY_TOKEN", "FIXTURE"] {
        assert!(names.contains(&wanted), "{wanted} missing from {names:?}");
    }
    for leaked in [
        "ANTHROPIC_API_KEY",
        "CLAUDE_CODE_OAUTH_TOKEN",
        "OPENAI_API_KEY",
        "VIBYRA_RUNNER_KEY",
        "DYLD_INSERT_LIBRARIES",
        "SOMETHING_ELSE",
    ] {
        assert!(!names.contains(&leaked), "{leaked} reached the server");
    }
}

#[test]
fn a_secret_value_never_appears_in_an_error_a_status_or_a_result() {
    if !node_available() {
        return;
    }
    let secret = "s3cr3t-value-9f2a";
    let keychain: Arc<FakeKeychain> = Arc::default();
    keychain
        .0
        .lock()
        .unwrap()
        .insert("test-leak-0000/FIXTURE_SECRET".into(), secret.into());
    let sup = supervisor(quick(), keychain.clone());
    // The server prints its secret to stderr and dies.
    let mut dying = spec("leak", "leak-secret,die-on-start");
    dying.secret_env.push("FIXTURE_SECRET".into());
    let error = sup.list_tools(&dying).unwrap_err();
    assert!(!error.to_string().contains(secret), "{error}");
    assert!(error.to_string().contains("[hidden]"), "{error}");
    assert!(!format!("{:?}", sup.status(&dying.id)).contains(secret));
    // A healthy server echoing the secret back in a result.
    let mut healthy = spec("leak", "");
    healthy.secret_env.push("FIXTURE_SECRET".into());
    sup.retry(&healthy.id);
    std::thread::sleep(Duration::from_millis(400));
    let echoed = sup
        .call_tool(&healthy, "echo", &json!({"text": format!("key={secret}")}))
        .unwrap();
    assert_eq!(echoed.text, "key=[hidden]");
}

#[test]
fn a_secret_is_never_written_to_the_servers_file() {
    let dir = tempfile::tempdir().unwrap();
    let mut spec = spec("file", "");
    spec.secret_env.push("MY_TOKEN".into());
    store::upsert(dir.path(), spec).unwrap();
    let raw = std::fs::read_to_string(store::path_in(dir.path())).unwrap();
    assert!(raw.contains("MY_TOKEN"), "the NAME is stored");
    assert_eq!(store::load(dir.path()).len(), 1);
}

#[test]
fn a_missing_program_and_a_missing_secret_say_what_to_do() {
    let sup = supervisor(quick(), Arc::default());
    let mut spec = spec("missing", "");
    spec.command = "definitely-not-installed-mcp".into();
    assert!(sup
        .list_tools(&spec)
        .unwrap_err()
        .to_string()
        .contains("was not found"));
    let mut needs = self::spec("needs", "");
    needs.secret_env.push("API_TOKEN".into());
    assert!(sup
        .list_tools(&needs)
        .unwrap_err()
        .to_string()
        .contains("API_TOKEN is not saved"));
}

#[test]
fn a_server_killed_from_outside_is_started_again_without_penalty() {
    if !node_available() {
        return;
    }
    let sup = supervisor(quick(), Arc::default());
    let spec = spec("killed", "");
    let first: i32 = text(&sup.call_tool(&spec, "pid", &json!({})).unwrap())
        .parse()
        .unwrap();
    kill(first);
    std::thread::sleep(Duration::from_millis(100));
    let second: i32 = text(&sup.call_tool(&spec, "pid", &json!({})).unwrap())
        .parse()
        .unwrap();
    assert_ne!(first, second);
    assert_eq!(sup.status(&spec.id).failures, 0);
}
