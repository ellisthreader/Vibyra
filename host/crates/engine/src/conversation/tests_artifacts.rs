use super::{stream, tests::setup};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

fn first_artifact(engine: &crate::Engine) -> Value {
    let snapshot = engine
        .handle(
            "phone",
            "conversation.snapshot",
            json!({"sessionId":"session"}),
        )
        .unwrap();
    snapshot["items"][0]["artifact"].clone()
}

/// Output past the 256 KiB an artifact keeps bounds to the bytes already
/// stored, so later deltas leave it exactly as it was, and its hash still
/// names what a phone pages out of it.
#[test]
fn output_past_the_retained_limit_leaves_the_stored_artifact_exact() {
    let (_dir, engine, _) = setup();
    let raw = json!({"id":"cmd","type":"commandExecution","command":"cargo build","status":"inProgress","aggregatedOutput":""});
    stream::receive(
        &engine.shared,
        "session",
        json!({"method":"item/started","params":{"threadId":"thread","turnId":"turn","item":raw}}),
    );
    let delta = |text: String| json!({"method":"item/commandExecution/outputDelta","params":{"threadId":"thread","turnId":"turn","itemId":"cmd","delta":text}});
    for _ in 0..3 {
        stream::receive(&engine.shared, "session", delta("a".repeat(100_000)));
    }
    let bounded = first_artifact(&engine);
    assert_eq!(bounded["bytes"], 256 * 1024);
    assert_eq!(bounded["truncated"], true);
    stream::receive(&engine.shared, "session", delta("more output".into()));
    assert_eq!(first_artifact(&engine), bounded);
    let mut content = String::new();
    let mut offset = Some(0);
    while let Some(at) = offset {
        let page = engine
            .handle(
                "phone",
                "conversation.artifact",
                json!({"sessionId":"session","artifactId":bounded["id"],"hash":bounded["hash"],"offset":at}),
            )
            .unwrap();
        content.push_str(page["content"].as_str().unwrap());
        offset = page["nextOffset"].as_u64();
    }
    assert_eq!(content.len(), 256 * 1024);
    assert_eq!(
        format!("{:x}", Sha256::digest(content.as_bytes())),
        bounded["hash"]
    );
}

/// The 64 MB limit counts UTF-8 bytes. `octet_length` has to agree with the
/// `length(CAST(.. AS BLOB))` it replaced for every kind of text, including
/// text long enough to live on overflow pages it no longer reads.
#[test]
fn retained_output_is_measured_in_utf8_bytes() {
    let db = rusqlite::Connection::open_in_memory().unwrap();
    db.execute_batch("CREATE TABLE t(content TEXT NOT NULL)")
        .unwrap();
    let texts = [
        String::new(),
        "plain".to_string(),
        "é😀e\u{301}".to_string(),
        "😀".repeat(100_000),
    ];
    for text in &texts {
        db.execute("INSERT INTO t VALUES(?1)", [text]).unwrap();
    }
    let (counted, cast): (i64, i64) = db
        .query_row(
            "SELECT SUM(octet_length(content)),SUM(length(CAST(content AS BLOB))) FROM t",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!(counted, cast);
    assert_eq!(
        counted as usize,
        texts.iter().map(String::len).sum::<usize>()
    );
}

/// Opening the engine saves what restoring changed, once. A conversation it
/// already left at rest is not written again on every later open.
#[test]
fn reopening_rewrites_only_conversations_that_needed_restoring() {
    let (dir, engine, _) = setup();
    stream::receive(&engine.shared, "session", super::tests::request());
    drop(engine);
    let connection = rusqlite::Connection::open(dir.path().join("state/engine.sqlite3")).unwrap();
    connection
        .execute_batch(
            "CREATE TABLE writes(id TEXT);
            CREATE TRIGGER counted AFTER UPDATE ON conversations BEGIN INSERT INTO writes VALUES(new.id); END;",
        )
        .unwrap();
    let writes = || -> i64 {
        connection
            .query_row("SELECT COUNT(*) FROM writes", [], |r| r.get(0))
            .unwrap()
    };
    // An engine just dropped holds its state directory until its background
    // threads notice, so opening again waits for that.
    let open = || {
        for _ in 0..200 {
            match crate::Engine::new(
                dir.path().join("state"),
                vec![("project".into(), dir.path().into())],
            ) {
                Ok(engine) => return engine,
                Err(error) if error.contains("already owns") => {
                    std::thread::sleep(std::time::Duration::from_millis(25))
                }
                Err(error) => panic!("{error}"),
            }
        }
        panic!("the state directory was never released");
    };
    let restored = open();
    let after = restored
        .handle(
            "phone",
            "conversation.snapshot",
            json!({"sessionId":"session"}),
        )
        .unwrap();
    assert_eq!(after["processState"], "interrupted");
    assert_eq!(after["items"][0]["status"], "expired");
    drop(restored);
    let first = writes();
    assert!(first > 0, "the restored conversation was never saved");
    let reopened = open();
    let again = reopened
        .handle(
            "phone",
            "conversation.snapshot",
            json!({"sessionId":"session"}),
        )
        .unwrap();
    assert_eq!(again["items"], after["items"]);
    drop(reopened);
    assert_eq!(writes(), first);
}
