//! Attachment tests.
//!
//! Both of these are about the same promise: a file a user drags in must not
//! become a hole in the boundary the chat was supposed to have. It is copied
//! out of the user's folder, and its name cannot become a path.

use super::*;
use crate::agent_model::{ChatSource, Engine};
use crate::agentdb::AgentDb;

fn detached_chat(db: &AgentDb) -> AgentChat {
    create(
        db,
        "acct",
        NewChat {
            agent_id: None,
            engine: Engine::Claude,
            title: String::new(),
            source: ChatSource::User,
        },
    )
    .unwrap()
}

/// An attachment is copied into the chat's own folder, and it is the copy the
/// provider is given — attaching a screenshot must not undo detachment.
#[test]
fn an_attachment_is_copied_out_of_the_users_folder() {
    let tmp = tempfile::tempdir().unwrap();
    let db = AgentDb::open_memory().unwrap();
    let chat = detached_chat(&db);
    let source = tmp.path().join("shot.png");
    std::fs::write(&source, b"not really a png").unwrap();

    let record = attachments::attach(&db, tmp.path(), &chat.id, source.to_str().unwrap()).unwrap();
    assert_ne!(record.managed_path, source.to_string_lossy());
    assert!(record.managed_path.contains(&chat.id));
    assert_eq!(record.mime, "image/png");
    assert_eq!(
        std::fs::read(&record.managed_path).unwrap(),
        b"not really a png"
    );
    assert_eq!(
        attachments::images(&db, &chat.id).unwrap(),
        vec![record.managed_path.clone()]
    );

    attachments::discard(tmp.path(), &chat.id);
    assert!(!std::path::Path::new(&record.managed_path).exists());
}

/// A name that looks like a path must not become one.
#[test]
fn an_attachment_name_cannot_climb_out_of_its_folder() {
    let tmp = tempfile::tempdir().unwrap();
    let db = AgentDb::open_memory().unwrap();
    let chat = detached_chat(&db);
    let nasty = tmp.path().join("evil.png");
    std::fs::write(&nasty, b"x").unwrap();

    let record = attachments::attach(&db, tmp.path(), &chat.id, nasty.to_str().unwrap()).unwrap();
    let folder = attachments::folder(tmp.path(), &chat.id);
    assert!(
        std::path::Path::new(&record.managed_path).starts_with(&folder),
        "{} escaped {}",
        record.managed_path,
        folder.display()
    );
}
