//! F-19: the runner key and session token travel in headers, so a redirect
//! from the API must be a refusal, never a hop that carries them elsewhere.

use super::*;
use crate::agent_v2::mock_http::{MockServer, Reply};

#[test]
fn a_redirect_is_refused_and_never_followed_with_the_credentials() {
    let elsewhere = MockServer::start(|_| (200, r#"{"ok":true}"#.to_string()));
    let target = format!("{}/stolen", elsewhere.base);
    let api = MockServer::start_raw(move |_| Reply {
        status: 302,
        headers: vec![("Location".into(), target.clone())],
        body: Vec::new(),
        length: true,
    });
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    let result = runtime.block_on(send(
        &api.base,
        None,
        Some("runner-key"),
        Method::POST,
        "runner/x/claim",
        None,
    ));
    assert!(
        matches!(result, Err(ApiError::Refused { status: 302, .. })),
        "{result:?}"
    );
    assert_eq!(api.paths().len(), 1, "the API was asked once");
    assert!(
        elsewhere.paths().is_empty(),
        "nothing followed the redirect: {:?}",
        elsewhere.paths()
    );
}

fn block_on<T>(work: impl std::future::Future<Output = T>) -> T {
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    runtime.block_on(work)
}

#[test]
fn a_runner_route_carries_the_runner_key_alone_and_a_client_route_the_session_alone() {
    let api = MockServer::start(|_| (200, r#"{"ok":true}"#.to_string()));
    block_on(send(
        &api.base,
        None,
        Some("runner-key"),
        Method::POST,
        "runner/x/claim",
        None,
    ))
    .unwrap();
    block_on(send(
        &api.base,
        Some("session-token"),
        None,
        Method::GET,
        "runtimes",
        None,
    ))
    .unwrap();
    let seen = api.requests.lock().unwrap();
    assert_eq!(seen[0].runner_key.as_deref(), Some("runner-key"));
    assert_eq!(
        seen[0].authorization, None,
        "no account session on a runner route"
    );
    assert_eq!(
        seen[1].authorization.as_deref(),
        Some("Bearer session-token")
    );
    assert_eq!(
        seen[1].runner_key, None,
        "a runner key never reaches a client route"
    );
}
