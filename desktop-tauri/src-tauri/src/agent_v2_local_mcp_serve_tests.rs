use super::support::*;
use super::*;

#[test]
fn a_server_that_is_off_removed_or_set_up_again_is_refused_before_anything_runs() {
    if !node() {
        return;
    }
    let read = action("echo", "read", "approved", None, json!({"text": "hi"}));
    for (connection, enabled, reason) in [
        (Some(CONN), false, "disabled"),
        (Some("other"), true, "server_changed"),
        (None, true, "server_changed"),
    ] {
        let (_dir, engine) = setup(connection, enabled);
        let server = backend("dispatching");
        serve_one(&engine, &server, &read);
        let claim = &bodies(&server, "/claim")[0];
        assert_eq!(claim["unavailable"]["reason"], reason);
        assert!(claim.get("tools").is_none());
        assert!(
            bodies(&server, "/receipt").is_empty(),
            "no receipt: the backend already settled it"
        );
    }
    let (dir, engine) = setup(Some(CONN), true);
    store::remove(dir.path(), "fixture-server-0001").unwrap();
    let server = backend("dispatching");
    serve_one(&engine, &server, &read);
    assert_eq!(
        bodies(&server, "/claim")[0]["unavailable"]["reason"],
        "disabled"
    );
}

#[test]
fn a_claim_the_backend_refuses_runs_nothing() {
    if !node() {
        return;
    }
    let (_dir, engine) = setup(Some(CONN), true);
    let server = backend("refused"); // e.g. tools_changed or a revoked grant
    serve_one(
        &engine,
        &server,
        &action("write_note", "write", "approved", None, json!({})),
    );
    assert_eq!(bodies(&server, "/claim").len(), 1);
    assert!(bodies(&server, "/receipt").is_empty());
    engine.supervisor.stop_all();
}

#[test]
fn a_write_already_claimed_by_this_lease_is_never_run_again() {
    let (_dir, engine) = setup(Some(CONN), true);
    let server = backend("dispatching");
    serve_one(
        &engine,
        &server,
        &action("write_note", "write", "dispatching", Some(7), json!({})),
    );
    assert!(
        server.requests.lock().unwrap().is_empty(),
        "no claim, no call, no receipt"
    );
}

#[test]
fn a_write_that_hangs_is_reported_unknown_and_the_server_is_stopped() {
    if !node() {
        return;
    }
    let (_dir, engine) = setup(Some(CONN), true);
    let server = backend("dispatching");
    serve_one(
        &engine,
        &server,
        &action("hang", "write", "approved", None, json!({})),
    );
    let receipt = &bodies(&server, "/receipt")[0]["result"];
    assert_eq!(
        (receipt["reason"].as_str(), receipt["unknown"].as_bool()),
        (Some("timeout"), Some(true))
    );
    assert_eq!(engine.supervisor.status("fixture-server-0001").failures, 1);
}

#[test]
fn a_receipt_that_could_not_be_sent_is_posted_again_not_the_call_run_again() {
    let (_dir, engine) = setup(Some(CONN), true);
    let server = backend("dispatching");
    let lease = lease(&server);
    let mut unsent = HashMap::from([(ID.to_owned(), json!({"text": "kept"}))]);
    // The read was claimed here and ran; only its answer was lost on the way.
    let read = action(
        "echo",
        "read",
        "dispatching",
        Some(7),
        json!({"text": "again"}),
    );
    tauri::async_runtime::block_on(serve(&engine, &lease, &read, &mut unsent));
    assert!(unsent.is_empty());
    assert!(
        bodies(&server, "/claim").is_empty(),
        "no second claim and no second call"
    );
    assert_eq!(
        bodies(&server, "/receipt")[0]["result"],
        json!({"text": "kept"})
    );
    assert_eq!(
        engine.supervisor.status("fixture-server-0001").state,
        vibyra_core::local_mcp::State::Stopped
    );
}
