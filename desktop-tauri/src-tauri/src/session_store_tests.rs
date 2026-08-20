use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};

use crate::session_store::{
    clear, load, normalize, save, trim_snapshot, PersistedPane, TerminalSession,
    TEST_MAX_PANES as MAX_PANES, TEST_MAX_SNAPSHOT_BYTES as MAX_SNAPSHOT_BYTES, VERSION,
};

struct SessionFile(PathBuf);

impl SessionFile {
    fn new() -> Self {
        static NEXT: AtomicU32 = AtomicU32::new(0);
        let name = format!(
            "vibyra-session-{}-{}.json",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        );
        let path = std::env::temp_dir().join(name);
        let _ = std::fs::remove_file(&path);
        Self(path)
    }
}

impl Drop for SessionFile {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

fn pane(title: &str, snapshot: Option<String>) -> PersistedPane {
    PersistedPane {
        project_id: "p1".into(),
        agent_id: "shell".into(),
        title: title.into(),
        permission_mode: "standard".into(),
        workspace_mode: "shared".into(),
        snapshot,
        ..PersistedPane::default()
    }
}

#[test]
fn a_saved_session_round_trips_with_its_order_intact() {
    let file = SessionFile::new();
    let session = TerminalSession {
        panes: vec![
            pane("first", Some("hello".into())),
            pane("second", None),
            pane("third", Some("world".into())),
        ],
        ..TerminalSession::default()
    };
    save(&file.0, session).unwrap();

    let loaded = load(&file.0);
    assert_eq!(loaded.version, VERSION);
    let titles: Vec<&str> = loaded.panes.iter().map(|p| p.title.as_str()).collect();
    assert_eq!(titles, ["first", "second", "third"]);
    assert_eq!(loaded.panes[0].snapshot.as_deref(), Some("hello"));
    assert_eq!(loaded.panes[1].snapshot, None);
}

#[test]
fn an_oversized_snapshot_is_trimmed_to_its_most_recent_output() {
    let snapshot = format!("{}TAIL", "x".repeat(MAX_SNAPSHOT_BYTES * 2));
    let trimmed = trim_snapshot(snapshot);
    assert!(trimmed.len() <= MAX_SNAPSHOT_BYTES);
    assert!(
        trimmed.ends_with("TAIL"),
        "kept the wrong end of the output"
    );
}

#[test]
fn trimming_never_splits_a_multibyte_character() {
    // A pure multi-byte string guarantees the naive cut lands mid-character.
    let snapshot = "é".repeat(MAX_SNAPSHOT_BYTES);
    let trimmed = trim_snapshot(snapshot);
    assert!(trimmed.len() <= MAX_SNAPSHOT_BYTES);
    assert!(trimmed.chars().all(|c| c == 'é'));
}

#[test]
fn too_many_panes_are_dropped() {
    let session = TerminalSession {
        panes: (0..MAX_PANES + 10)
            .map(|i| pane(&i.to_string(), None))
            .collect(),
        ..TerminalSession::default()
    };
    assert_eq!(normalize(session).panes.len(), MAX_PANES);
}

#[test]
fn a_foreign_version_restores_nothing_rather_than_guessing() {
    let file = SessionFile::new();
    std::fs::write(&file.0, r#"{"version":999,"panes":[{"title":"old"}]}"#).unwrap();
    assert!(load(&file.0).panes.is_empty());
}

#[test]
fn a_corrupt_or_unversioned_file_never_blocks_startup() {
    let file = SessionFile::new();
    std::fs::write(&file.0, "{not json").unwrap();
    assert!(load(&file.0).panes.is_empty());

    std::fs::write(&file.0, r#"{"panes":[{"title":"old"}]}"#).unwrap();
    assert!(load(&file.0).panes.is_empty());

    let missing = SessionFile::new();
    assert!(load(&missing.0).panes.is_empty());
}

#[test]
fn clearing_is_idempotent() {
    let file = SessionFile::new();
    save(&file.0, TerminalSession::default()).unwrap();
    clear(&file.0).unwrap();
    clear(&file.0).unwrap();
    assert!(!file.0.exists());
}

#[cfg(unix)]
#[test]
fn the_session_file_is_owner_only() {
    use std::os::unix::fs::PermissionsExt;

    let file = SessionFile::new();
    save(&file.0, TerminalSession::default()).unwrap();
    assert_eq!(
        file.0.metadata().unwrap().permissions().mode() & 0o777,
        0o600
    );
}
