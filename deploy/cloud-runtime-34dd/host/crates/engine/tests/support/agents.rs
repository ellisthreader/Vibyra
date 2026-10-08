//! Fake `claude` / `codex` scripts on a private PATH and HOME, plus a rig that
//! restarts an engine from its journal the way a Host restart does.
use super::wait;
use serde_json::{json, Value};
use std::{
    os::unix::fs::PermissionsExt,
    path::{Path, PathBuf},
    sync::OnceLock,
};
use uuid::Uuid;
use vibyra_host_engine::Engine;

const CLAUDE: &str = r#"#!/bin/sh
case "$1" in
  --version) echo "claude 9.9.9"; exit 0;;
  auth) echo '{"loggedIn":false}'; exit 1;;
esac
for a in "$@"; do
  if [ "$a" = "--help" ]; then echo '  --permission-mode <mode>  (choices: "manual", "plan")'; exit 0; fi
done
echo "$@" >> claude.args
prev=""
for a in "$@"; do
  if [ "$prev" = "--session-id" ]; then
    mkdir -p "$HOME/.claude/projects/-fake" && echo '{}' > "$HOME/.claude/projects/-fake/$a.jsonl"
  fi
  prev="$a"
done
exec sleep 20
"#;

const CODEX: &str = r#"#!/bin/sh
case "$1" in
  --version) echo "codex-cli 9.9.9"; exit 0;;
  login) echo "Not logged in" >&2; exit 1;;
esac
echo "$@" >> codex.args
exec sleep 20
"#;

/// One fake HOME and PATH for the whole test binary, set before any engine.
pub fn home() -> &'static Path {
    static HOME: OnceLock<PathBuf> = OnceLock::new();
    HOME.get_or_init(|| {
        let root = tempfile::tempdir().unwrap().keep();
        let bin = root.join("bin");
        std::fs::create_dir_all(&bin).unwrap();
        for (name, body) in [("claude", CLAUDE), ("codex", CODEX)] {
            std::fs::write(bin.join(name), body).unwrap();
            std::fs::set_permissions(bin.join(name), std::fs::Permissions::from_mode(0o755))
                .unwrap();
        }
        let path = std::env::join_paths([bin, "/usr/bin".into(), "/bin".into()]).unwrap();
        std::env::set_var("PATH", path);
        std::env::set_var("HOME", root.join("home"));
        std::env::remove_var("CLAUDE_CONFIG_DIR");
        std::env::remove_var("CODEX_HOME");
        root.join("home")
    })
}

pub struct Rig {
    pub dir: tempfile::TempDir,
    pub project: PathBuf,
}

pub fn rig() -> Rig {
    home();
    let dir = tempfile::tempdir().unwrap();
    let project = dir.path().join("project");
    std::fs::create_dir(&project).unwrap();
    Rig { dir, project }
}

impl Rig {
    pub fn engine(&self, state: &str) -> Engine {
        Engine::new(
            self.dir.path().join(state),
            vec![("Test".into(), self.project.clone())],
        )
        .unwrap()
    }

    /// What a restart leaves: the journal as it was while the session ran.
    pub fn restart(&self, engine: Engine, edit: impl FnOnce(&rusqlite::Connection)) -> Engine {
        let backup = self.dir.path().join("saved.sqlite3");
        let _ = std::fs::remove_file(&backup);
        let live =
            rusqlite::Connection::open(self.dir.path().join("state/engine.sqlite3")).unwrap();
        live.execute("VACUUM INTO ?1", [backup.to_string_lossy().as_ref()])
            .unwrap();
        drop(live);
        drop(engine);
        let next = self.dir.path().join(format!("restart-{}", Uuid::new_v4()));
        std::fs::create_dir(&next).unwrap();
        std::fs::copy(&backup, next.join("engine.sqlite3")).unwrap();
        edit(&rusqlite::Connection::open(next.join("engine.sqlite3")).unwrap());
        Engine::new(next, vec![("Test".into(), self.project.clone())]).unwrap()
    }
}

pub fn create(engine: &Engine, kind: &str) -> Value {
    let state = engine.handle("phone", "host.state", json!({})).unwrap();
    engine
        .handle(
            "phone",
            "session.create",
            json!({"projectId":state["projects"][0]["id"],"title":"Fix the build","kind":kind,
                "requestId":Uuid::new_v4().to_string()}),
        )
        .unwrap()
}

pub fn only_session(engine: &Engine) -> Value {
    let list = engine.handle("phone", "session.list", json!({})).unwrap();
    assert_eq!(list["sessionCount"], 1);
    list["sessions"][0].clone()
}

pub fn resume(engine: &Engine, session: &Value) -> Result<Value, String> {
    engine.handle(
        "phone",
        "session.resume",
        json!({"sessionId":session["id"]}),
    )
}

/// The command lines the fake CLI has recorded, once there are `count`.
pub fn args(rig: &Rig, file: &str, count: usize) -> Vec<String> {
    let path = rig.project.join(file);
    let read = || -> Vec<String> {
        std::fs::read_to_string(&path)
            .unwrap_or_default()
            .lines()
            .map(str::to_owned)
            .collect()
    };
    wait(|| read().len() >= count);
    read()
}
