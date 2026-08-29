//! The durable store behind Agent Mode.
//!
//! Terminal sessions stay in their own JSON file: they are a snapshot of what
//! is on screen, rewritten wholesale, and a crash mid-write costs one restore.
//! Agent Mode is the opposite shape — an append-only event log per chat, read
//! back by range, written from a scheduler thread while the UI reads — so it
//! gets a real database with WAL, foreign keys and transactional migrations
//! rather than a file that has to be parsed in full to append one line.
//!
//! The handle is deliberately small. Everything above it (`agent_profiles`,
//! `agent_chats`, `routines`, …) speaks in domain methods, and no SQL ever
//! reaches a Tauri command.

mod backup;
pub mod ids;
mod schema;
mod schema_agents;
mod schema_work;
#[cfg(test)]
mod tests;

pub use backup::backup_path;

use std::path::{Path, PathBuf};

use parking_lot::{Mutex, MutexGuard};
use rusqlite::Connection;

use crate::error::{CoreError, CoreResult};

/// One account's Agent Mode database.
///
/// Wrapped in a mutex rather than pooled: every caller is either a UI command
/// answering one question or the scheduler taking one step, both of which are
/// short, and one writer is what WAL is happiest with anyway.
#[derive(Debug)]
pub struct AgentDb {
    connection: Mutex<Connection>,
    path: PathBuf,
}

impl AgentDb {
    /// Opens (creating if absent) the database at `path` and brings it to the
    /// current schema version.
    ///
    /// A database whose version is *newer* than this build is refused rather
    /// than opened. Downgrading Vibyra must not silently write rows an older
    /// schema cannot express; the user is told to update instead.
    pub fn open(path: &Path) -> CoreResult<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
            crate::fsx::harden_dir(parent);
        }
        let connection = Connection::open(path).map_err(sql)?;
        configure(&connection)?;
        let found = user_version(&connection)?;
        let target = schema::target_version();
        if found > target {
            return Err(CoreError::Settings(format!(
                "this agent database was written by a newer Vibyra (schema {found}, this build reads {target})"
            )));
        }
        if found < target {
            backup::before_migration(path, found)?;
            migrate(&connection, found)?;
        }
        crate::fsx::harden(path);
        Ok(Self {
            connection: Mutex::new(connection),
            path: path.to_path_buf(),
        })
    }

    /// An in-memory database at the current schema, for tests and for probing
    /// a migration without touching the user's file.
    pub fn open_memory() -> CoreResult<Self> {
        let connection = Connection::open_in_memory().map_err(sql)?;
        configure(&connection)?;
        migrate(&connection, 0)?;
        Ok(Self {
            connection: Mutex::new(connection),
            path: PathBuf::from(":memory:"),
        })
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Runs `task` against the connection. The lock is held for its duration,
    /// so a task must not block on anything but the database.
    pub fn with<T>(&self, task: impl FnOnce(&Connection) -> CoreResult<T>) -> CoreResult<T> {
        let guard = self.connection.lock();
        task(&guard)
    }

    /// Runs `task` inside one transaction, rolling back on any error so a
    /// multi-row domain operation is all-or-nothing.
    pub fn transact<T>(&self, task: impl FnOnce(&Connection) -> CoreResult<T>) -> CoreResult<T> {
        let mut guard: MutexGuard<Connection> = self.connection.lock();
        let tx = guard.transaction().map_err(sql)?;
        let value = task(&tx)?;
        tx.commit().map_err(sql)?;
        Ok(value)
    }
}

/// The pragmas every connection needs, applied before any statement runs.
///
/// `foreign_keys` is per-connection in SQLite and off by default, so the
/// cascade rules the schema documents are only real once this has run.
fn configure(connection: &Connection) -> CoreResult<()> {
    connection
        .pragma_update(None, "journal_mode", "WAL")
        .map_err(sql)?;
    connection
        .pragma_update(None, "foreign_keys", "ON")
        .map_err(sql)?;
    connection
        .pragma_update(None, "synchronous", "NORMAL")
        .map_err(sql)?;
    connection
        .busy_timeout(std::time::Duration::from_secs(5))
        .map_err(sql)?;
    Ok(())
}

fn user_version(connection: &Connection) -> CoreResult<i64> {
    connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(sql)
}

/// Applies every migration after `from`, each in its own transaction.
fn migrate(connection: &Connection, from: i64) -> CoreResult<()> {
    for (index, chunks) in schema::MIGRATIONS.iter().enumerate() {
        let version = index as i64 + 1;
        if version <= from {
            continue;
        }
        connection.execute_batch("BEGIN").map_err(sql)?;
        let applied = chunks
            .iter()
            .try_for_each(|chunk| connection.execute_batch(chunk))
            .and_then(|()| connection.pragma_update(None, "user_version", version));
        match applied {
            Ok(()) => connection.execute_batch("COMMIT").map_err(sql)?,
            Err(error) => {
                let _ = connection.execute_batch("ROLLBACK");
                return Err(CoreError::Settings(format!(
                    "agent database migration {version} failed: {error}"
                )));
            }
        }
    }
    Ok(())
}

/// SQLite errors reach the UI as text, so they are flattened here rather than
/// given a variant every caller would have to match on.
pub(crate) fn sql(error: rusqlite::Error) -> CoreError {
    CoreError::Settings(format!("agent database: {error}"))
}
