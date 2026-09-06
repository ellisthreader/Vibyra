//! Separate provider runtime databases without re-importing years of CLI history.
use std::{
    path::{Path, PathBuf},
    time::Duration,
};
use vibyra_core::agent_runtime::{TurnCommand, TurnHandle};

static INITIALIZING: parking_lot::Mutex<()> = parking_lot::Mutex::new(());

pub fn prepare(
    root: &Path,
    account: &str,
    command: &TurnCommand,
    handle: &TurnHandle,
) -> Result<PathBuf, String> {
    let _guard = loop {
        if handle.cancelled() {
            return Err("Stopped by the user.".into());
        }
        if let Some(guard) = INITIALIZING.try_lock_for(Duration::from_millis(100)) {
            break guard;
        }
    };
    let folder = root
        .join("provider-state")
        .join("codex")
        .join(vibyra_core::agent_context::digest(account));
    std::fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    vibyra_core::fsx::harden_dir(&folder);
    let home = command
        .env
        .iter()
        .find(|(k, _)| k == "CODEX_HOME")
        .map(|(_, v)| PathBuf::from(v))
        .or_else(|| dirs::home_dir().map(|p| p.join(".codex")));
    if let Some(home) = home.filter(|p| p.is_dir()) {
        for entry in std::fs::read_dir(home).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let name = entry.file_name().to_string_lossy().into_owned();
            let version = name
                .strip_prefix("state_")
                .and_then(|s| s.strip_suffix(".sqlite"));
            if !version.is_some_and(|s| !s.is_empty() && s.bytes().all(|c| c.is_ascii_digit())) {
                continue;
            }
            let target = folder.join(&name);
            if target.exists() {
                continue;
            }
            // Only the thread index is migrated. Credentials, logs, queues,
            // memories and goals remain in their respective provider homes.
            copy_index(&entry.path(), &target, handle)?;
        }
    }
    Ok(folder)
}

fn copy_index(source: &Path, target: &Path, handle: &TurnHandle) -> Result<(), String> {
    let temporary = target.with_extension(format!("{}.tmp", vibyra_core::agentdb::ids::new_id()));
    let result = (|| -> Result<(), String> {
        let source = rusqlite::Connection::open_with_flags(
            source,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
        )
        .map_err(|e| format!("Could not open the provider thread index: {e}"))?;
        let mut destination = rusqlite::Connection::open(&temporary).map_err(|e| e.to_string())?;
        let until = std::time::Instant::now() + Duration::from_secs(30);
        {
            let backup = rusqlite::backup::Backup::new(&source, &mut destination)
                .map_err(|e| e.to_string())?;
            loop {
                if handle.cancelled() {
                    return Err("Stopped by the user.".into());
                }
                if std::time::Instant::now() >= until {
                    return Err("The provider thread index is busy. Retry once other provider startup activity finishes.".into());
                }
                match backup.step(256).map_err(|e| e.to_string())? {
                    rusqlite::backup::StepResult::Done => break,
                    _ => std::thread::sleep(Duration::from_millis(10)),
                }
            }
        }
        drop(destination);
        std::fs::rename(&temporary, target).map_err(|e| e.to_string())
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temporary);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bootstrap_snapshots_the_selected_index_once_without_credentials() {
        let root = tempfile::tempdir().unwrap();
        let home = root.path().join("selected");
        std::fs::create_dir(&home).unwrap();
        let source = rusqlite::Connection::open(home.join("state_5.sqlite")).unwrap();
        source
            .execute_batch("CREATE TABLE marker(value); INSERT INTO marker VALUES (7);")
            .unwrap();
        std::fs::write(home.join("auth.json"), "private fixture").unwrap();
        let command = TurnCommand {
            program: "codex".into(),
            args: vec![],
            cwd: root.path().to_string_lossy().into_owned(),
            env: vec![("CODEX_HOME".into(), home.to_string_lossy().into_owned())],
            env_remove: vec![],
            prompt: String::new(),
        };
        let handle = TurnHandle::new();
        let folder = prepare(root.path(), "a", &command, &handle).unwrap();
        let copied = rusqlite::Connection::open(folder.join("state_5.sqlite")).unwrap();
        assert_eq!(
            copied
                .query_row("SELECT value FROM marker", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            7
        );
        assert!(!folder.join("auth.json").exists());
        source.execute("UPDATE marker SET value=9", []).unwrap();
        assert_eq!(
            prepare(root.path(), "a", &command, &handle).unwrap(),
            folder
        );
        assert_eq!(
            copied
                .query_row("SELECT value FROM marker", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            7
        );
        assert_ne!(
            prepare(root.path(), "b", &command, &handle).unwrap(),
            folder
        );
    }
}
