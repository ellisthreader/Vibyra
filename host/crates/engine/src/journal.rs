use crate::state::{Metadata, Session};
use rusqlite::{params, Connection};
use std::{collections::HashMap, path::Path};

pub(crate) struct Journal {
    pub(crate) connection: Connection,
    _instance_lock: std::fs::File,
}

impl Journal {
    pub fn open(directory: &Path) -> Result<Self, String> {
        std::fs::create_dir_all(directory).map_err(|e| e.to_string())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(directory, std::fs::Permissions::from_mode(0o700))
                .map_err(|e| e.to_string())?;
        }
        let instance_lock = std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(directory.join("engine.lock"))
            .map_err(|e| e.to_string())?;
        fs2::FileExt::try_lock_exclusive(&instance_lock)
            .map_err(|_| "another Vibyra Host already owns this state directory")?;
        let path = directory.join("engine.sqlite3");
        let connection = Connection::open(&path).map_err(|e| e.to_string())?;
        connection
            .execute_batch(
                "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY, owner TEXT NOT NULL, request TEXT NOT NULL,
                metadata TEXT NOT NULL, UNIQUE(owner, request));
            CREATE TABLE IF NOT EXISTS adopted_projects (
                path TEXT PRIMARY KEY, name TEXT NOT NULL, adopted_at TEXT NOT NULL);",
            )
            .map_err(|e| e.to_string())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
                .map_err(|e| e.to_string())?;
        }
        Ok(Self {
            connection,
            _instance_lock: instance_lock,
        })
    }

    pub fn save(&self, session: &Session) -> Result<(), String> {
        let encoded = serde_json::to_string(&session.meta).map_err(|e| e.to_string())?;
        self.connection
            .execute(
                "INSERT INTO sessions(id, owner, request, metadata) VALUES(?1,?2,?3,?4)
            ON CONFLICT(id) DO UPDATE SET metadata=excluded.metadata",
                params![session.meta.id, session.owner, session.request, encoded],
            )
            .map(|_| ())
            .map_err(|e| e.to_string())
    }

    pub fn save_project(&self, name: &str, path: &Path) -> Result<(), String> {
        self.connection
            .execute(
                "INSERT INTO adopted_projects(path, name, adopted_at) VALUES(?1,?2,?3)
            ON CONFLICT(path) DO UPDATE SET name=excluded.name",
                params![path.to_string_lossy(), name, crate::now()],
            )
            .map(|_| ())
            .map_err(|e| e.to_string())
    }

    /// Stops an adopted folder coming back on the next run. A folder the Host
    /// was started with on the command line is not recorded here, so forgetting
    /// one of those lasts only as long as this run.
    pub fn forget_project(&self, path: &Path) -> Result<(), String> {
        self.connection
            .execute(
                "DELETE FROM adopted_projects WHERE path = ?1",
                params![path.to_string_lossy()],
            )
            .map(|_| ())
            .map_err(|e| e.to_string())
    }

    /// Folders adopted by earlier runs, oldest first. Whether each still exists
    /// is the caller's question; a folder that was deleted is simply not listed.
    pub fn adopted_projects(&self) -> Result<Vec<(String, std::path::PathBuf)>, String> {
        let mut statement = self
            .connection
            .prepare("SELECT name, path FROM adopted_projects ORDER BY adopted_at, path")
            .map_err(|e| e.to_string())?;
        let rows = statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| e.to_string())?;
        let mut projects = Vec::new();
        for row in rows {
            let (name, path) = row.map_err(|e| e.to_string())?;
            projects.push((name, std::path::PathBuf::from(path)));
        }
        Ok(projects)
    }

    pub fn restore(&self) -> Result<HashMap<String, Session>, String> {
        let mut statement = self
            .connection
            .prepare("SELECT metadata, owner, request FROM sessions")
            .map_err(|e| e.to_string())?;
        let rows = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        let mut sessions = HashMap::new();
        for row in rows {
            let (metadata, owner, request) = row.map_err(|e| e.to_string())?;
            let mut metadata: Metadata =
                serde_json::from_str(&metadata).map_err(|e| e.to_string())?;
            let interrupted = metadata.status == "running";
            if interrupted {
                metadata.status = "interrupted".into();
            }
            let session = Session::restored(metadata, owner, request);
            if interrupted {
                self.save(&session)?;
            }
            sessions.insert(session.meta.id.clone(), session);
        }
        Ok(sessions)
    }
}
