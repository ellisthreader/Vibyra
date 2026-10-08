//! Account mode against a local mock of the runtime API (plain http on
//! loopback). No real network, relay or Fly machine is involved.
use crate::{account_activity, account_source, config::Account, test_support};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
};

/// The trusted flag is process-wide; tests that touch it take turns.
static FLAG: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

type Seen = Arc<Mutex<Vec<(String, String, Value)>>>;

/// Serves `replies` in order, one connection each, recording path, bearer, body.
async fn mock(replies: Vec<(u16, Value)>) -> (String, Seen) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let seen: Seen = Default::default();
    let log = seen.clone();
    tokio::spawn(async move {
        for (status, reply) in replies {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut raw = Vec::new();
            let mut chunk = [0u8; 4096];
            let (head, body) = loop {
                let n = socket.read(&mut chunk).await.unwrap();
                raw.extend_from_slice(&chunk[..n]);
                let text = String::from_utf8_lossy(&raw).to_string();
                if let Some((head, body)) = text.split_once("\r\n\r\n") {
                    let length = head
                        .lines()
                        .find_map(|l| {
                            l.to_lowercase()
                                .strip_prefix("content-length:")
                                .map(|v| v.trim().parse::<usize>().unwrap())
                        })
                        .unwrap_or(0);
                    if body.len() >= length {
                        break (head.to_owned(), body.to_owned());
                    }
                }
            };
            let path = head
                .lines()
                .next()
                .unwrap()
                .split(' ')
                .nth(1)
                .unwrap()
                .to_owned();
            let bearer = head
                .lines()
                .find_map(|l| l.strip_prefix("Authorization: Bearer "))
                .unwrap_or("")
                .to_owned();
            log.lock().unwrap().push((
                path,
                bearer,
                serde_json::from_str(&body).unwrap_or(Value::Null),
            ));
            let body = reply.to_string();
            let response = format!(
                "HTTP/1.1 {status} X\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            );
            socket.write_all(response.as_bytes()).await.unwrap();
        }
    });
    (base, seen)
}

fn account(base: &str, dir: &std::path::Path, token: &str) -> Account {
    let file = dir.join("token");
    std::fs::write(&file, token).unwrap();
    Account {
        api_base: base.into(),
        workspace_id: "ws-1".into(),
        token_file: file,
        interval: 15,
        idle_session_secs: 600,
    }
}

fn challenge(host_public: &str) -> (Value, String) {
    let mut key = [0u8; 32];
    hex::decode_to_slice(host_public, &mut key).unwrap();
    let secret = [42u8; 32];
    let sealed = crypto_box::PublicKey::from(key)
        .seal(&mut crypto_box::aead::OsRng, &secret)
        .unwrap();
    (
        json!({"challengeId":"11111111-1111-4111-8111-111111111111","ciphertext":STANDARD.encode(sealed)}),
        STANDARD.encode(secret),
    )
}

fn registered(url: &str) -> Value {
    json!({"relayUrl":url,"token":"t".repeat(40),"authorizationKey":STANDARD.encode([1u8; 32]),
        "authorizationContext":{"userId":"7","generation":3},"hostPolicy":"trusted"})
}

#[tokio::test]
async fn register_answers_the_challenge_and_pins_the_authorization() {
    let _turn = FLAG.lock().await;
    let (dir, shared) = test_support::state();
    let public = shared.identity.lock().unwrap().public_key.clone();
    let (ciphertext, proof) = challenge(&public);
    let (base, seen) = mock(vec![
        (200, ciphertext),
        (200, registered("wss://relay.example/ws")),
    ])
    .await;
    let acct = account(&base, dir.path(), "runtime-token-one");
    let credentials = account_source::register(&shared, &acct).await.unwrap();
    assert_eq!(credentials.url, "wss://relay.example/ws");
    assert!(!credentials.allow_unsigned_loopback);
    assert_eq!(
        credentials
            .authorization_context
            .as_ref()
            .unwrap()
            .generation,
        3
    );
    assert!(credentials.authorization_key.is_some());
    assert!(crate::cloud_trust::enabled());
    let seen = seen.lock().unwrap();
    assert_eq!(seen[0].0, "/api/cloud-runtime/ws-1/host/challenge");
    assert_eq!(seen[1].0, "/api/cloud-runtime/ws-1/host/register");
    assert!(seen.iter().all(|call| call.1 == "runtime-token-one"));
    assert_eq!(seen[0].2["hostId"], public);
    assert_eq!(seen[1].2["proof"], proof);
    assert_eq!(seen[1].2["wantTrusted"], true);
    assert_eq!(
        seen[1].2["challengeId"],
        "11111111-1111-4111-8111-111111111111"
    );
    crate::cloud_trust::set(false);
}

#[tokio::test]
async fn each_attempt_rereads_a_rotated_token_and_registers_again() {
    let _turn = FLAG.lock().await;
    let (dir, shared) = test_support::state();
    let public = shared.identity.lock().unwrap().public_key.clone();
    let (c, _) = challenge(&public);
    let (base, seen) = mock(vec![
        (200, c.clone()),
        (200, registered("wss://relay.example/ws")),
        (200, c),
        (200, registered("wss://relay.example/ws")),
    ])
    .await;
    let acct = account(&base, dir.path(), "first-token\n");
    let source = account_source::source(shared.clone(), acct.clone());
    source().await.unwrap();
    std::fs::write(&acct.token_file, "rotated-token").unwrap();
    source().await.unwrap();
    let seen = seen.lock().unwrap();
    assert_eq!(seen.len(), 4);
    assert_eq!(seen[0].1, "first-token");
    assert_eq!(seen[3].1, "rotated-token");
    crate::cloud_trust::set(false);
}

#[tokio::test]
async fn a_refused_or_unreadable_runtime_fails_closed_without_leaking_the_token() {
    let (dir, shared) = test_support::state();
    let (base, _) = mock(vec![(401, json!({"error":"secret-token-xyz expired"}))]).await;
    let acct = account(&base, dir.path(), "secret-token-xyz");
    let error = account_source::register(&shared, &acct).await.unwrap_err();
    assert!(!error.contains("secret-token-xyz"), "{error}");
    let missing = Account {
        token_file: PathBuf::from("/nonexistent/token"),
        ..acct.clone()
    };
    assert!(account_source::register(&shared, &missing).await.is_err());
    std::fs::write(&acct.token_file, "   \n").unwrap();
    assert!(account_source::read_token(&acct.token_file).is_err());
    std::fs::write(&acct.token_file, "bad token\r\nInjected: 1").unwrap();
    assert!(account_source::read_token(&acct.token_file).is_err());
}

#[tokio::test]
async fn trust_is_reset_at_every_attempt_and_after_a_network_failure() {
    let _turn = FLAG.lock().await;
    let (dir, shared) = test_support::state();
    // A previous attempt left trust on; this attempt cannot reach the API.
    crate::cloud_trust::set(true);
    let acct = account("http://127.0.0.1:1", dir.path(), "runtime-token-one");
    assert!(account_source::register(&shared, &acct).await.is_err());
    assert!(!crate::cloud_trust::enabled());
    // An HTTP refusal also leaves it off.
    crate::cloud_trust::set(true);
    let (base, _) = mock(vec![(503, json!({"error":"down"}))]).await;
    let acct = account(&base, dir.path(), "runtime-token-one");
    assert!(account_source::register(&shared, &acct).await.is_err());
    assert!(!crate::cloud_trust::enabled());
}

#[test]
fn registration_replies_missing_binding_or_a_plain_relay_are_refused() {
    let good = registered("wss://relay.example/ws");
    assert!(account_source::credentials(&good, "n".into()).unwrap().1);
    let mut cases = Vec::new();
    for field in [
        "authorizationKey",
        "authorizationContext",
        "token",
        "relayUrl",
    ] {
        let mut broken = good.clone();
        broken.as_object_mut().unwrap().remove(field);
        cases.push(broken);
    }
    for url in [
        "ws://relay.example/ws",
        "http://relay.example",
        "ws://127.0.0.1:9",
        "",
    ] {
        cases.push(registered(url));
    }
    let mut short = good.clone();
    short["token"] = json!("short");
    cases.push(short);
    let mut zero = good.clone();
    zero["authorizationContext"]["generation"] = json!(0);
    cases.push(zero);
    let mut badkey = good.clone();
    badkey["authorizationKey"] = json!("AAAA");
    cases.push(badkey);
    for case in cases {
        assert!(
            account_source::credentials(&case, "n".into()).is_err(),
            "{case}"
        );
    }
    // Without the backend saying so, the computer is not trusted.
    let mut plain = good;
    plain.as_object_mut().unwrap().remove("hostPolicy");
    assert!(!account_source::credentials(&plain, "n".into()).unwrap().1);
}

#[tokio::test]
async fn a_bad_reply_never_enables_trust() {
    let _turn = FLAG.lock().await;
    let (dir, shared) = test_support::state();
    let public = shared.identity.lock().unwrap().public_key.clone();
    let (c, _) = challenge(&public);
    let mut reply = registered("ws://relay.example/ws");
    reply["hostPolicy"] = json!("trusted");
    crate::cloud_trust::set(true);
    let (base, _) = mock(vec![(200, c), (200, reply)]).await;
    let acct = account(&base, dir.path(), "runtime-token-one");
    assert!(account_source::register(&shared, &acct).await.is_err());
    assert!(!crate::cloud_trust::enabled());
}

#[test]
fn activity_payload_has_the_contract_shape() {
    let home = tempfile::tempdir().unwrap();
    let project = home.path().join("app");
    std::fs::create_dir_all(project.join(".git")).unwrap();
    std::fs::write(project.join(".git/HEAD"), "ref: refs/heads/vibyra/fix\n").unwrap();
    std::fs::write(
        project.join(".git/config"),
        "[core]\n\tbare = false\n[remote \"origin\"]\n\turl = https://github.com/acme/app.git\n",
    )
    .unwrap();
    let activity = vibyra_engine::Activity {
        running: 2,
        open: 5,
        waiting_approval: 1,
        projects: vec![
            ("app".into(), project),
            ("empty".into(), home.path().join("none")),
        ],
    };
    let signed_out = account_activity::payload(&activity, home.path());
    assert_eq!(signed_out["running"], 2);
    assert_eq!(signed_out["waitingApproval"], 1);
    assert_eq!(signed_out["open"], 5);
    assert_eq!(signed_out["login"], json!({"claude":false,"codex":false}));
    assert_eq!(
        signed_out["projects"][0],
        json!({"name":"app","repo":"acme/app","branch":"vibyra/fix"})
    );
    assert_eq!(
        signed_out["projects"][1],
        json!({"name":"empty","repo":null,"branch":null})
    );
    std::fs::create_dir_all(home.path().join(".claude")).unwrap();
    std::fs::write(home.path().join(".claude/.credentials.json"), "{}").unwrap();
    std::fs::create_dir_all(home.path().join(".codex")).unwrap();
    std::fs::write(home.path().join(".codex/auth.json"), "").unwrap();
    // Present and non-empty counts; an empty file does not.
    assert_eq!(
        account_activity::login(home.path()),
        json!({"claude":true,"codex":false})
    );
}

#[test]
fn github_remotes_become_slugs() {
    for (url, slug) in [
        ("git@github.com:acme/app.git", Some("acme/app")),
        (
            "https://x-access-token:abc@github.com/acme/app",
            Some("acme/app"),
        ),
        ("https://gitlab.com/acme/app.git", None),
        ("https://github.com/acme", None),
    ] {
        assert_eq!(account_activity::repo_slug(url).as_deref(), slug, "{url}");
    }
}

#[tokio::test]
async fn activity_is_posted_with_the_current_token() {
    let (dir, _shared) = test_support::state();
    let (base, seen) = mock(vec![(200, json!({"ok":true,"disabledProviders":[]}))]).await;
    let acct = account(&base, dir.path(), "runtime-token-one");
    let engine = vibyra_engine::Engine::new_dynamic(dir.path().join("engine"), Vec::new()).unwrap();
    account_activity::report(&acct, &engine).await.unwrap();
    let seen = seen.lock().unwrap();
    assert_eq!(seen[0].0, "/api/cloud-runtime/ws-1/host/activity");
    assert_eq!(seen[0].1, "runtime-token-one");
    assert_eq!(seen[0].2["running"], 0);
    assert_eq!(seen[0].2["providerPolicyVersion"], 1);
    assert!(seen[0].2["projects"].as_array().unwrap().is_empty());
}

#[tokio::test]
async fn activity_reply_turns_providers_off_and_on() {
    let (dir, _shared) = test_support::state();
    let (base, _seen) = mock(vec![
        (200, json!({"ok":true,"disabledProviders":["claude"]})),
        (200, json!({"ok":true})),
        (200, json!({"ok":true,"disabledProviders":[]})),
    ])
    .await;
    let acct = account(&base, dir.path(), "runtime-token-one");
    let engine = vibyra_engine::Engine::new_dynamic(dir.path().join("engine"), Vec::new()).unwrap();
    let offered = |engine: &vibyra_engine::Engine| {
        engine.handle("phone", "host.state", json!({})).unwrap()["capabilities"]
            ["conversationProviders"]
            .clone()
    };
    account_activity::report(&acct, &engine).await.unwrap();
    assert_eq!(offered(&engine), json!(["codex", "gemini"]));
    // A reply without the field is not a valid policy and leaves the last restriction in place.
    assert!(account_activity::report(&acct, &engine).await.is_err());
    assert_eq!(offered(&engine), json!(["codex", "gemini"]));
    account_activity::report(&acct, &engine).await.unwrap();
    assert_eq!(offered(&engine), json!(["codex", "claude", "gemini"]));
}

fn grant(
    shared: &crate::state::Shared,
    device: &str,
    permissions: &[&str],
) -> crate::remote_authorization::Access {
    let host = shared.identity.lock().unwrap().id();
    let (key, token) = crate::remote_test_support::signed(&crate::remote_test_support::claims(
        &host,
        device,
        permissions,
    ));
    Some(
        crate::remote_authorization::Authorization::new(
            &key,
            &token,
            &host,
            &crate::remote_test_support::context(),
        )
        .unwrap(),
    )
}

#[tokio::test]
async fn trusted_policy_admits_only_a_signed_terminal_grant() {
    let _turn = FLAG.lock().await;
    let (_dir, shared) = test_support::state();
    let device = hex::encode(&vibyra_transport::generate_keypair().unwrap()[32..]);
    let hello = json!({"protocol":1,"deviceName":"My phone"}).to_string();
    let admit = |access: &crate::remote_authorization::Access| {
        crate::cloud_trust::admit(&shared, &device, hello.as_bytes(), access).unwrap();
        shared.trusted(&device)
    };
    // Off by default, whatever the grant says.
    crate::cloud_trust::set(false);
    assert!(!admit(&grant(&shared, &device, &["terminal:access"])));
    crate::cloud_trust::set(true);
    // On, but no signed grant, or a grant without terminal access.
    assert!(!admit(&None));
    assert!(!admit(&grant(&shared, &device, &["files:read"])));
    assert!(admit(&grant(&shared, &device, &["terminal:access"])));
    crate::cloud_trust::set(false);
}

#[tokio::test]
async fn cloud_startup_stays_closed_until_a_complete_provider_policy_arrives() {
    let (dir, _shared) = test_support::state();
    let (base, _seen) = mock(vec![
        (200, json!({"ok":true})),
        (200, json!({"ok":true,"disabledProviders":["claude",null]})),
        (200, json!({"ok":true,"disabledProviders":["claude"]})),
    ])
    .await;
    let acct = account(&base, dir.path(), "runtime-token-one");
    let engine = vibyra_engine::Engine::new_dynamic(dir.path().join("engine"), Vec::new()).unwrap();
    assert!(account_activity::initialize(&acct, &engine).await.is_err());
    for provider in ["claude", "codex"] {
        let error = engine
            .handle("phone", "aiAccounts.connect", json!({"provider":provider}))
            .unwrap_err();
        assert!(error.contains("turned off"), "{error}");
    }
    assert!(account_activity::report(&acct, &engine).await.is_err());
    account_activity::report(&acct, &engine).await.unwrap();
    let state = engine.handle("phone", "host.state", json!({})).unwrap();
    assert_eq!(
        state["capabilities"]["conversationProviders"],
        json!(["codex", "gemini"])
    );
}
