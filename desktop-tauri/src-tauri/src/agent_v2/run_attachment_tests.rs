//! The whole run path with attachments: real `run()` against a loopback backend
//! and a fake `claude`. Proves the launch is untouched, delivery is inline, stale
//! and refused downloads end the run safely, and everything is deleted afterwards.
#![cfg(unix)]

use crate::agent_v2::attachments::MAX_BYTES;
use crate::agent_v2::attachments_support::*;
use crate::agent_v2::execute::Outcome;
use std::path::Path;

#[path = "run_attachment_harness.rs"]
mod harness;
#[path = "run_attachment_live_tests.rs"]
mod live;
use harness::*;

#[test]
fn the_launch_is_identical_with_and_without_attachments() {
    let plain = run_once(vec![], |_| panic!("no attachments, no download"));
    let (items, serve) = three();
    let with = run_once(items, serve);
    assert_eq!(
        (&plain.outcome, &with.outcome),
        (&Outcome::Completed, &Outcome::Completed)
    );
    let expected = [
        "-p",
        "--input-format",
        "stream-json",
        "--output-format",
        "stream-json",
        "--verbose",
        "--include-partial-messages",
        "--tools",
        "",
        "--mcp-config",
        "<RUN>/ctl/mcp.json",
        "--strict-mcp-config",
        "--setting-sources",
        "",
        "--permission-mode",
        "dontAsk",
        "--allowedTools",
        "mcp__vibyra-broker__gmail_search",
        "--disable-slash-commands",
        "--no-chrome",
        "--no-session-persistence",
        "--model",
        "haiku",
    ];
    assert_eq!(plain.argv(), expected);
    assert_eq!(
        with.argv(),
        expected,
        "attachments change no flag, tool or path"
    );
    assert_eq!(plain.env(), with.env(), "nor the environment");
    let env = with.env();
    let names: Vec<_> = env.lines().map(|l| l.split('=').next().unwrap()).collect();
    assert_eq!(names, ["HOME", "LANG", "LOGNAME", "PATH", "TMPDIR", "USER"]);
}

#[test]
fn attachments_reach_claude_inline_and_their_files_die_with_the_run() {
    let (items, serve) = three();
    let with = run_once(items, serve);
    assert_eq!(with.outcome, Outcome::Completed);
    let gets: Vec<_> = with
        .requests
        .iter()
        .filter(|r| r.method == "GET")
        .map(|r| r.path.clone())
        .collect();
    assert_eq!(gets.len(), 3);
    assert!(
        gets.iter().all(|p| p.ends_with("?generation=1")),
        "{gets:?}"
    );
    assert_eq!(with.posts(), ["complete"]);
    let files = with.read("files").unwrap();
    let names: Vec<_> = files.lines().collect();
    assert_eq!(
        names.len(),
        3,
        "downloaded into attachments/ while it ran: {files}"
    );
    assert!(names[0].starts_with("attachment-1-") && names[0].ends_with(".jpg"));
    assert!(names[2].starts_with("attachment-3-") && names[2].ends_with(".pdf"));
    let message = with.user();
    let content = message["message"]["content"].as_array().unwrap();
    let kinds: Vec<_> = content
        .iter()
        .map(|b| b["type"].as_str().unwrap())
        .collect();
    assert_eq!(
        kinds,
        ["text", "text", "text", "image", "text", "text", "text", "document", "text", "text"]
    );
    assert!(content[0]["text"]
        .as_str()
        .unwrap()
        .ends_with("What is in my files?"));
    assert!(content[5]["text"]
        .as_str()
        .unwrap()
        .contains("Deploy code: PLUM-7"));
    let wire = message.to_string();
    assert!(
        !wire.contains(&with.root()) && !wire.contains("attachment-1-"),
        "Claude gets content, never paths"
    );
    assert!(
        !Path::new(&with.root()).exists(),
        "the run folder and its attachments are gone"
    );
    let plain = run_once(vec![], |_| panic!("unused"));
    assert_eq!(
        plain.user()["message"]["content"][0],
        content[0],
        "the prompt text itself is unchanged"
    );
    assert_eq!(
        plain.user()["message"]["content"].as_array().unwrap().len(),
        1
    );
}

#[test]
fn a_stale_lease_while_fetching_abandons_the_run_without_starting_claude() {
    let photo = jpeg();
    let served = photo.clone();
    let items = vec![
        item(IDS[0], "a.jpg", "image/jpeg", &photo),
        item(IDS[1], "b.jpg", "image/jpeg", &photo),
    ];
    let stale = run_once(items, move |id| {
        if id == IDS[1] {
            refusal_reply(409, "stale_lease")
        } else {
            file_reply("image/jpeg", &served)
        }
    });
    assert_eq!(stale.outcome, Outcome::Stale);
    assert!(
        stale.posts().is_empty(),
        "a run another claim owns gets no fail, events or complete"
    );
    assert!(stale.read("argv").is_none(), "Claude was never started");
    let cancelled = run_once(vec![item(IDS[0], "a.jpg", "image/jpeg", &photo)], |_| {
        refusal_reply(409, "run_cancelled")
    });
    assert_eq!(cancelled.outcome, Outcome::Cancelled);
    assert!(cancelled.posts().is_empty() && cancelled.read("argv").is_none());
}

#[test]
fn oversize_and_bad_types_fail_the_run_with_runner_error() {
    let big = vec![b'a'; MAX_BYTES + 1];
    let (served, meta) = (big.clone(), item(IDS[0], "big.txt", "text/plain", b"a"));
    let oversize = run_once(vec![meta], move |_| file_reply("text/plain", &served));
    let zip = run_once(
        vec![item(IDS[0], "x.zip", "application/zip", b"PK\x03\x04")],
        |_| file_reply("application/zip", b"PK\x03\x04"),
    );
    for (run, why) in [(&oversize, "larger than 2 MB"), (&zip, "cannot read")] {
        assert_eq!(run.outcome, Outcome::Failed("runner_error".into()));
        assert_eq!(run.posts(), ["fail"]);
        let body = &run.requests.last().unwrap().body;
        assert_eq!(
            (body["code"].as_str(), body["generation"].as_u64()),
            (Some("runner_error"), Some(1))
        );
        assert!(body["reason"].as_str().unwrap().contains(why), "{body}");
        assert!(run.read("argv").is_none(), "Claude was never started");
    }
}
