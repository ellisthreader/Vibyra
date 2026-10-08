use super::*;

#[test]
fn a_disallowed_type_fails_the_run_and_leaves_no_file() {
    let server = MockServer::start_raw(|_| file_reply("application/zip", b"PK\x03\x04"));
    let (result, dir) = fetch(
        &server,
        vec![item(IDS[0], "a.zip", "application/zip", b"PK\x03\x04")],
        &Control::default(),
    );
    assert!(refused(&result).starts_with("Attachment 1 is a kind of file Agents cannot read"));
    assert_eq!(
        std::fs::read_dir(dir.path().join("attachments"))
            .unwrap()
            .count(),
        0
    );
}

#[test]
fn redirects_are_never_followed_so_the_runner_key_stays_home() {
    let elsewhere = MockServer::start_raw(|_| file_reply("text/plain", b"stolen"));
    let target = format!("{}/steal", elsewhere.base);
    let away = MockServer::start_raw(move |_| Reply {
        status: 302,
        headers: vec![("Location".into(), target.clone())],
        body: Vec::new(),
        length: true,
    });
    let (result, _) = fetch(
        &away,
        vec![item(IDS[0], "a.txt", "text/plain", b"x")],
        &Control::default(),
    );
    assert!(refused(&result).contains("somewhere else"));
    assert!(
        elsewhere.requests.lock().unwrap().is_empty(),
        "the other host saw nothing"
    );
    assert_eq!(away.requests.lock().unwrap().len(), 1);
}

#[test]
fn refusals_damage_and_bad_claims_fail_with_a_clear_reason() {
    let server = MockServer::start_raw(|_| refusal_reply(404, "attachment_not_found"));
    let (result, _) = fetch(
        &server,
        vec![item(IDS[0], "a", "text/plain", b"x")],
        &Control::default(),
    );
    assert!(refused(&result).contains("no longer available"));
    let server = MockServer::start_raw(|_| file_reply("text/plain", b"tampered"));
    let (result, _) = fetch(
        &server,
        vec![item(IDS[0], "a", "text/plain", b"original")],
        &Control::default(),
    );
    assert!(refused(&result).contains("arrived damaged"));
    let quiet = MockServer::start_raw(|_| file_reply("text/plain", b"x"));
    let nine: Vec<_> = (0..9)
        .map(|_| item(IDS[0], "a", "text/plain", b"x"))
        .collect();
    assert!(refused(&fetch(&quiet, nine, &Control::default()).0).contains("at most 8"));
    let traversal = json!({"id": "../../etc/passwd", "name": "x"});
    assert!(refused(&fetch(&quiet, vec![traversal], &Control::default()).0).contains("invalid id"));
    assert!(quiet.requests.lock().unwrap().is_empty());
    let older = json!({"name": "notes.txt", "mimeType": "text/plain", "size": 5});
    let (result, _) = fetch(&quiet, vec![older], &Control::default());
    assert_eq!(
        result.unwrap(),
        [Saved::Unread {
            label: "notes.txt".into()
        }]
    );
    assert!(quiet.requests.lock().unwrap().is_empty());
}
