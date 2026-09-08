use crate::state::{Metadata, Session};
use rusqlite::{params, Connection};
use std::{collections::HashMap, path::Path};

pub(crate) struct Journal {
    connection: Connection,
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
                metadata TEXT NOT NULL, UNIQUE(owner, request));",
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
            if interrupted { self.save(&session)?; }
            sessions.insert(session.meta.id.clone(), session);
        }
        Ok(sessions)
    }
}
