//! What a headless Host reports about itself: how busy it is, and which
//! folders under one root it shares. Both are read from the engine's own state.
use crate::Engine;
use serde_json::json;
use std::{
    path::{Path, PathBuf},
    sync::OnceLock,
    time::{Duration, Instant},
};

/// Monotonic milliseconds since the first call in this process.
pub(crate) fn mono_ms() -> u64 {
    static START: OnceLock<Instant> = OnceLock::new();
    START.get_or_init(Instant::now).elapsed().as_millis() as u64
}

/// A point-in-time count the account API uses to decide whether to keep a
/// machine awake. It carries no output, titles or paths.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Activity {
    /// Sessions doing work: terminals with PTY output or input inside the idle
    /// window, plus conversations mid-turn. Only this keeps a machine awake.
    pub running: usize,
    /// Every session still open, busy or idle (display only).
    pub open: usize,
    /// Conversations paused for a person to answer a provider request.
    pub waiting_approval: usize,
    /// Shared project folders, `(name, path)`.
    pub projects: Vec<(String, PathBuf)>,
}

impl Engine {
    /// Same engine, an empty approved-project list allowed: a headless Host
    /// whose projects arrive later through `adopt_projects_in`.
    pub fn new_dynamic(
        state_dir: PathBuf,
        projects: Vec<(String, PathBuf)>,
    ) -> Result<Self, String> {
        if projects.is_empty() {
            Self::from_projects(state_dir, Vec::new(), Default::default())
        } else {
            Self::new(state_dir, projects)
        }
    }

    /// Busy work as of now; see `activity_at`.
    pub fn activity(&self, idle: Duration) -> Activity {
        self.activity_at(mono_ms(), idle)
    }

    /// `now_ms` is on the `mono_ms` clock, injectable for tests. A running
    /// session counts as busy only if its PTY moved within `idle`; a
    /// conversation counts while a turn is running or paused for approval.
    pub(crate) fn activity_at(&self, now_ms: u64, idle: Duration) -> Activity {
        let state = self.shared.lock();
        let window = idle.as_millis() as u64;
        let open = |s: &&crate::state::Session| s.meta.status == "running";
        Activity {
            open: state.sessions.values().filter(open).count(),
            running: state
                .sessions
                .values()
                .filter(open)
                .filter(|s| now_ms.saturating_sub(s.last_io_ms) < window)
                .count()
                + state
                    .conversations
                    .values()
                    .filter(|c| c.turn_state == "running")
                    .count(),
            waiting_approval: state
                .conversations
                .values()
                .filter(|conversation| conversation.turn_state == "waiting")
                .count(),
            projects: state
                .projects
                .iter()
                .map(|project| (project.name.clone(), project.path.clone()))
                .collect(),
        }
    }

    /// Shares every real sub-folder of `root` that is not shared yet and tells
    /// connected phones. Hidden folders and symlinks are ignored. Returns how
    /// many were added; stops quietly at the project limit.
    pub fn adopt_projects_in(&self, root: &Path) -> Result<usize, String> {
        let mut folders: Vec<PathBuf> = std::fs::read_dir(root)
            .map_err(|e| format!("projects folder unavailable: {e}"))?
            .filter_map(Result::ok)
            .filter(|entry| {
                !entry.file_name().to_string_lossy().starts_with('.')
                    && entry.file_type().is_ok_and(|kind| kind.is_dir())
            })
            .map(|entry| entry.path())
            .collect();
        folders.sort();
        let mut state = self.shared.lock();
        let mut added = 0;
        for folder in folders {
            let known = std::fs::canonicalize(&folder)
                .map(|path| state.projects.iter().any(|p| p.path == path))
                .unwrap_or(true);
            if known {
                continue;
            }
            if state.adopt_project(&folder).is_err() {
                break;
            }
            added += 1;
        }
        if added > 0 {
            state.emit("host.changed", json!({}));
        }
        Ok(added)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        conversation::model::Conversation,
        state::{Metadata, Session},
    };

    const IDLE: Duration = Duration::from_secs(600);

    fn engine() -> (tempfile::TempDir, Engine) {
        let dir = tempfile::tempdir().unwrap();
        let engine = Engine::new_dynamic(dir.path().join("state"), Vec::new()).unwrap();
        (dir, engine)
    }

    fn add_session(engine: &Engine, id: &str, status: &str, last_io_ms: u64) {
        let meta = Metadata {
            id: id.into(),
            project_id: "p".into(),
            title: "t".into(),
            kind: "terminal".into(),
            status: status.into(),
            created_at: "now".into(),
            runner: None,
        };
        let mut session = Session::restored(meta, "dev".into(), "r".into());
        session.last_io_ms = last_io_ms;
        engine.shared.lock().sessions.insert(id.into(), session);
    }

    fn add_conversation(engine: &Engine, id: &str, turn: &str) {
        let mut c = Conversation::new("g".into());
        c.turn_state = turn.into();
        engine.shared.lock().conversations.insert(id.into(), c);
    }

    #[test]
    fn idle_shell_is_open_but_not_active() {
        let (_d, e) = engine();
        add_session(&e, "a", "running", 1_000);
        let a = e.activity_at(1_000 + 3_600_000, IDLE);
        assert_eq!((a.running, a.open), (0, 1));
    }

    #[test]
    fn output_inside_the_window_is_active_and_expires() {
        let (_d, e) = engine();
        add_session(&e, "a", "running", 1_000_000);
        assert_eq!(e.activity_at(1_000_000 + 599_000, IDLE).running, 1);
        assert_eq!(e.activity_at(1_000_000 + 600_000, IDLE).running, 0);
        // New output moves the window.
        e.shared.lock().sessions.get_mut("a").unwrap().last_io_ms = 1_700_000;
        assert_eq!(e.activity_at(1_700_000 + 1_000, IDLE).running, 1);
    }

    #[test]
    fn exited_sessions_are_neither_open_nor_active() {
        let (_d, e) = engine();
        add_session(&e, "a", "exited", 1_000);
        let a = e.activity_at(1_001, IDLE);
        assert_eq!((a.running, a.open), (0, 0));
    }

    #[test]
    fn conversations_count_mid_turn_and_waiting_not_idle() {
        let (_d, e) = engine();
        add_conversation(&e, "r", "running");
        add_conversation(&e, "w", "waiting");
        add_conversation(&e, "i", "idle");
        let a = e.activity_at(u64::MAX / 2, IDLE);
        assert_eq!((a.running, a.waiting_approval, a.open), (1, 1, 0));
    }

    #[test]
    fn append_refreshes_the_clock() {
        let (_d, e) = engine();
        add_session(&e, "a", "running", 0);
        let mut state = e.shared.lock();
        let s = state.sessions.get_mut("a").unwrap();
        s.append("x");
        assert!(s.last_io_ms >= mono_ms().saturating_sub(1000));
    }

    #[test]
    fn new_folders_become_projects_without_a_restart() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("projects");
        std::fs::create_dir_all(root.join("alpha")).unwrap();
        std::fs::create_dir_all(root.join(".hidden")).unwrap();
        std::fs::write(root.join("file.txt"), "x").unwrap();
        let engine = Engine::new_dynamic(dir.path().join("state"), Vec::new()).unwrap();
        assert!(engine.activity(IDLE).projects.is_empty());
        assert_eq!(engine.adopt_projects_in(&root).unwrap(), 1);
        assert_eq!(engine.adopt_projects_in(&root).unwrap(), 0);
        std::fs::create_dir(root.join("beta")).unwrap();
        assert_eq!(engine.adopt_projects_in(&root).unwrap(), 1);
        let names: Vec<_> = engine
            .activity(IDLE)
            .projects
            .into_iter()
            .map(|p| p.0)
            .collect();
        assert_eq!(names, ["alpha", "beta"]);
        assert_eq!(engine.activity(IDLE).running, 0);
        assert_eq!(engine.activity(IDLE).waiting_approval, 0);
    }
}
