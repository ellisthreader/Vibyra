use super::*;
use crate::launch::{args, permission_mode, Start};

const ID: &str = "0199f3a2-7b1c-7d4e-9a10-4c5d6e7f8091";

fn homes() -> (tempfile::TempDir, Homes) {
    let dir = tempfile::tempdir().unwrap();
    let homes = Homes {
        claude: dir.path().join(".claude"),
        codex: dir.path().join(".codex"),
    };
    (dir, homes)
}

#[test]
fn ids_are_plain_uuids_only() {
    assert!(valid_id(ID));
    assert!(valid_id(&ID.to_uppercase()));
    for bad in [
        "",
        "latest",
        "--help",
        &ID[..35],
        &format!("{ID}0"),
        "0199f3a27b1c7d4e9a104c5d6e7f8091",
        "{0199f3a2-7b1c-7d4e-9a10-4c5d6e7f8091}",
        "0199f3a2-7b1c-7d4e-9a10-4c5d6e7f809;",
        "../../etc/passwd../../../../../../etc",
    ] {
        assert!(!valid_id(bad), "{bad}");
    }
}

#[test]
fn claude_transcripts_are_found_under_any_project_folder() {
    let (_dir, homes) = homes();
    assert!(!transcript_exists("claude", &homes, ID));
    let project = homes.claude.join("projects/-data-projects-app");
    std::fs::create_dir_all(&project).unwrap();
    assert!(!transcript_exists("claude", &homes, ID));
    std::fs::write(project.join(format!("{ID}.jsonl")), "{}\n").unwrap();
    assert!(transcript_exists("claude", &homes, ID));
    assert!(!transcript_exists("codex", &homes, ID));
    assert!(!transcript_exists("claude", &homes, "not-an-id"));
    assert!(!transcript_exists("shell", &homes, ID));
}

#[test]
fn codex_rollouts_are_found_by_their_id_suffix() {
    let (_dir, homes) = homes();
    let day = homes.codex.join("sessions/2026/10/02");
    std::fs::create_dir_all(&day).unwrap();
    std::fs::write(
        day.join("rollout-2026-10-02T09-00-00-ffffffff-7b1c-7d4e-9a10-4c5d6e7f8091.jsonl"),
        "{}",
    )
    .unwrap();
    assert!(!transcript_exists("codex", &homes, ID));
    std::fs::write(
        day.join(format!("rollout-2026-10-02T09-30-00-{ID}.jsonl")),
        "{}",
    )
    .unwrap();
    assert!(transcript_exists("codex", &homes, ID));
}

#[test]
fn claude_session_is_pinned_then_resumed_with_the_same_id() {
    let fresh = args(
        "claude",
        "manual",
        Start::Fresh {
            session_id: Some(ID),
        },
    );
    assert_eq!(
        fresh,
        ["--permission-mode", "manual", "--session-id", ID].map(String::from)
    );
    let resumed = args("claude", "manual", Start::Resume { session_id: ID });
    assert_eq!(
        resumed,
        ["--resume", ID, "--permission-mode", "manual"].map(String::from)
    );
}

#[test]
fn codex_resume_verb_comes_first_and_fresh_has_no_id() {
    let fresh = args("codex", "", Start::Fresh { session_id: None });
    assert_eq!(fresh[0], "--sandbox");
    assert!(!fresh.contains(&"resume".to_string()));
    let resumed = args("codex", "", Start::Resume { session_id: ID });
    assert_eq!(&resumed[..2], ["resume", ID]);
    assert_eq!(&resumed[2..], &fresh[..]);
}

#[test]
fn claude_permission_mode_follows_the_installed_help() {
    assert_eq!(
        permission_mode("choices: \"manual\", \"plan\""),
        Ok("manual")
    );
    assert_eq!(permission_mode("choices: \"default\""), Ok("default"));
    assert!(permission_mode("nothing").is_err());
}
