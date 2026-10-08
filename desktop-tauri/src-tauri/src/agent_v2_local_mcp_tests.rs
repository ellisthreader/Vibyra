use super::support::*;
use super::*;

#[test]
fn a_read_is_claimed_with_the_live_tools_run_on_the_server_and_answered() {
    if !node() {
        return;
    }
    let (_dir, engine) = setup(Some(CONN), true);
    let server = backend("dispatching");
    serve_one(
        &engine,
        &server,
        &action("echo", "read", "approved", None, json!({"text": "hi"})),
    );
    let claim = &bodies(&server, "/claim")[0];
    assert_eq!(claim["generation"], 7);
    assert_eq!(claim["fingerprint"], FP);
    assert_eq!(
        claim["tools"].as_array().unwrap().len(),
        10,
        "the live catalogue rides on the claim"
    );
    assert_eq!(
        bodies(&server, "/receipt")[0]["result"],
        json!({"text": "hi"})
    );
    let sent = server
        .requests
        .lock()
        .unwrap()
        .iter()
        .map(|r| r.body.to_string())
        .collect::<String>();
    assert!(
        !sent.contains("server.mjs") && !sent.contains("FIXTURE"),
        "the command line and environment never leave the Mac"
    );
    engine.supervisor.stop_all();
}
