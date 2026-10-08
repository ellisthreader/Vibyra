use super::*;
use crate::agent_v2::attachments_support::*;
use crate::agent_v2::mock_http::{MockServer, Reply};
use serde_json::json;

/// The result and the temp dir holding the `attachments` folder (keep it alive to inspect files).
fn fetch(
    server: &MockServer,
    items: Vec<Value>,
    control: &Control,
) -> (Result<Vec<Saved>, Stop>, tempfile::TempDir) {
    let dir = tempfile::tempdir().unwrap();
    let folder = dir.path().join("attachments");
    let claimed = claim(3, items);
    let result =
        tauri::async_runtime::block_on(fetch_all(&api(server), &claimed, &folder, control));
    (result, dir)
}

fn refused(result: &Result<Vec<Saved>, Stop>) -> &str {
    match result {
        Err(Stop::Fail(Refusal {
            code: "runner_error",
            reason,
        })) => reason,
        other => panic!("expected a runner_error failure, got {other:?}"),
    }
}

#[test]
fn a_download_carries_the_lease_generation_and_saves_under_a_generated_name() {
    let bytes = jpeg();
    let served = bytes.clone();
    let server = MockServer::start_raw(move |_| file_reply("image/jpeg", &served));
    let hostile = "../../secret\u{202e}.jpg";
    let (result, dir) = fetch(
        &server,
        vec![item(IDS[0], hostile, "image/jpeg", &bytes)],
        &Control::default(),
    );
    let folder = dir.path().join("attachments");
    let requests = server.requests.lock().unwrap().clone();
    assert_eq!(requests.len(), 1);
    assert_eq!(requests[0].method, "GET");
    assert_eq!(
        requests[0].path,
        format!(
            "/api/agents/v2/runner/{RT}/runs/{RUN}/attachments/{}?generation=3",
            IDS[0]
        )
    );
    assert_eq!(requests[0].runner_key, Some("k".repeat(64)));
    assert_eq!(
        requests[0].authorization, None,
        "the runner key alone, no account session"
    );
    let saved = result.unwrap();
    let Saved::File {
        label,
        kind,
        path,
        bytes: len,
    } = &saved[0]
    else {
        panic!("not a file")
    };
    assert_eq!(
        (label.as_str(), *kind, *len),
        ("secret.jpg", Kind::Image("image/jpeg"), bytes.len())
    );
    assert_eq!(path.parent().unwrap(), folder);
    let name = path.file_name().unwrap().to_string_lossy().into_owned();
    assert_eq!(name, format!("attachment-1-{}.jpg", &sha(&bytes)[..8]));
    assert_eq!(std::fs::read(path).unwrap(), bytes);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(
            std::fs::metadata(path).unwrap().permissions().mode() & 0o777,
            0o600
        );
    }
    let names: Vec<_> = std::fs::read_dir(&folder)
        .unwrap()
        .map(|e| e.unwrap().file_name())
        .collect();
    assert_eq!(names.len(), 1, "nothing but the generated file: {names:?}");
}

#[test]
fn a_stale_lease_partway_through_stops_the_run_quietly() {
    let bytes = jpeg();
    let served = bytes.clone();
    let server = MockServer::start_raw(move |request| {
        if request.path.contains(IDS[1]) {
            refusal_reply(409, "stale_lease")
        } else {
            file_reply("image/jpeg", &served)
        }
    });
    let items = vec![
        item(IDS[0], "a.jpg", "image/jpeg", &bytes),
        item(IDS[1], "b.jpg", "image/jpeg", &bytes),
    ];
    let (result, _) = fetch(&server, items, &Control::default());
    assert_eq!(result.unwrap_err(), Stop::Stale);
    let methods: Vec<_> = server
        .requests
        .lock()
        .unwrap()
        .iter()
        .map(|r| r.method.clone())
        .collect();
    assert_eq!(
        methods,
        ["GET", "GET"],
        "nothing was posted for a run another claim owns"
    );
    for code in ["run_cancelled", "run_finished"] {
        let server = MockServer::start_raw(move |_| refusal_reply(409, code));
        let (result, _) = fetch(
            &server,
            vec![item(IDS[0], "a", "image/jpeg", &bytes)],
            &Control::default(),
        );
        assert_eq!(result.unwrap_err(), Stop::Cancelled);
    }
    // The heartbeat's verdict stops it between files without another request.
    let control = Control::default();
    control.stale.store(true, Ordering::SeqCst);
    let (result, _) = fetch(
        &server,
        vec![item(IDS[0], "a", "image/jpeg", &bytes)],
        &control,
    );
    assert_eq!(result.unwrap_err(), Stop::Stale);
}

#[test]
fn oversize_is_refused_before_and_during_the_download() {
    let big = vec![b'a'; MAX_BYTES + 1];
    let served = big.clone();
    let server = MockServer::start_raw(move |_| file_reply("text/plain", &served));
    let mut promised = item(IDS[0], "big.txt", "text/plain", b"x");
    promised["size"] = json!(MAX_BYTES + 1);
    let (result, _) = fetch(&server, vec![promised], &Control::default());
    assert!(refused(&result).contains("larger than 2 MB"));
    assert!(
        server.requests.lock().unwrap().is_empty(),
        "the metadata already said too big"
    );
    let (result, _) = fetch(
        &server,
        vec![item(IDS[0], "big.txt", "text/plain", b"x")],
        &Control::default(),
    );
    assert!(refused(&result).contains("Attachment 1 is larger than 2 MB"));
    let streamed = big.clone();
    let server = MockServer::start_raw(move |_| Reply {
        length: false,
        ..file_reply("text/plain", &streamed)
    });
    let (result, dir) = fetch(
        &server,
        vec![item(IDS[0], "big.txt", "text/plain", b"x")],
        &Control::default(),
    );
    assert!(refused(&result).contains("larger than 2 MB"), "{result:?}");
    assert_eq!(
        std::fs::read_dir(dir.path().join("attachments"))
            .unwrap()
            .count(),
        0
    );
}

#[path = "attachments_refusal_tests.rs"]
mod refusals;
