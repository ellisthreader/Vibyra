use super::*;
use crate::session_process_files::{open_files, process_family, process_parents};

const FIRST: &str = "3f9a1c2e-5b7d-4e81-9a3f-2c6d8e0b4a17";
const SECOND: &str = "9c2b7d10-4e6a-4f52-8b31-0d5e7a1c9f44";
fn path(id: &str) -> String {
    format!("/accounts/one/sessions/2026/09/09/rollout-2026-09-09T10-00-00-{id}.jsonl")
}

#[test]
fn same_folder_chats_are_bound_to_their_own_processes() {
    let files = open_files(&format!("p10\nn{}\np20\nn{}\n", path(FIRST), path(SECOND)));
    let root = Path::new("/accounts/one");
    assert_eq!(
        choose_identity(&[(10, 0)], &files, root).as_deref(),
        Some(FIRST)
    );
    assert_eq!(
        choose_identity(&[(20, 0)], &files, root).as_deref(),
        Some(SECOND)
    );
}

#[test]
fn node_wrappers_are_followed_but_subagent_chats_do_not_win() {
    let parents = process_parents("10 1\n11 10\n12 11\n20 1\n");
    let family = process_family(10, &parents);
    let files = open_files(&format!("p11\nn{}\np12\nn{}\n", path(FIRST), path(SECOND)));
    assert_eq!(
        choose_identity(&family, &files, Path::new("/accounts/one")).as_deref(),
        Some(FIRST)
    );
    assert!(!family.iter().any(|(pid, _)| *pid == 20));
}

#[test]
fn multiple_ids_at_the_same_depth_are_never_guessed() {
    let files = open_files(&format!("p10\nn{}\nn{}\n", path(FIRST), path(SECOND)));
    assert!(choose_identity(&[(10, 0)], &files, Path::new("/accounts/one")).is_none());
}

#[test]
fn other_accounts_and_malformed_rollout_ids_are_rejected() {
    assert!(rollout_id(Path::new(&path(FIRST)), Path::new("/accounts/two")).is_none());
    assert!(rollout_id(Path::new(&path("--not-a-uuid")), Path::new("/accounts/one")).is_none());
    assert!(rollout_id(
        Path::new("/accounts/one/auth.json"),
        Path::new("/accounts/one")
    )
    .is_none());
}

#[cfg(target_os = "macos")]
#[test]
fn mac_identifies_two_real_pty_processes_with_open_rollouts() {
    use std::sync::Arc;
    use vibyra_core::pty::{FlushConfig, LaunchSpec, OutputSink, PtyManager};
    struct Sink;
    impl OutputSink for Sink {
        fn on_output(&self, _: u64, _: String) {}
        fn on_resync(&self, _: u64, _: String) {}
        fn on_exit(&self, _: u64, _: Option<i32>) {}
    }
    let root = std::env::temp_dir().join(format!("vibyra-mac-identity-{}", std::process::id()));
    let folder = root.join("sessions/2026/09/09");
    std::fs::create_dir_all(&folder).unwrap();
    let manager = PtyManager::new(Arc::new(Sink), FlushConfig::default());
    let mut targets = Vec::new();
    for id in [FIRST, SECOND] {
        let file = folder.join(format!("rollout-fixture-{id}.jsonl"));
        let mut spec = LaunchSpec::shell(Some("/bin/sh".into()), None);
        // Positional args preserve spaces and avoid shell interpolation.
        spec.args = vec![
            "-c".into(),
            "exec 3>\"$1\"; printf ready; read answer".into(),
            "fixture".into(),
            file.to_string_lossy().into_owned(),
        ];
        let info = manager.create_session("codex", "fixture", &spec).unwrap();
        targets.push((
            info.id,
            manager.process_id(info.id).unwrap().unwrap(),
            root.clone(),
        ));
    }
    for _ in 0..100 {
        if targets
            .iter()
            .all(|(id, _, _)| manager.snapshot(*id).unwrap().contains("ready"))
        {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(10));
    }
    let identities = identify_targets(&targets).unwrap();
    manager.shutdown();
    assert_eq!(identities[0].session_id.as_deref(), Some(FIRST));
    assert_eq!(identities[1].session_id.as_deref(), Some(SECOND));
    let _ = std::fs::remove_dir_all(root);
}
