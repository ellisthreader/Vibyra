//! A copy of the database taken before it is upgraded.
//!
//! Migrations are transactional, so a failed one leaves the file exactly as it
//! was — this is not insurance against that. It is insurance against a
//! migration that *succeeds* and is wrong: a rule that drops the wrong rows
//! looks like a clean upgrade to SQLite and like lost work to the user. The
//! copy is what makes that recoverable, and what lets a user downgrade Vibyra
//! after trying a build they did not get on with.
//!
//! One backup per source version, overwritten on retry. Keeping a copy per
//! attempt would grow without bound on a machine that keeps failing.

use std::path::{Path, PathBuf};

use crate::error::CoreResult;

/// Where the pre-upgrade copy of `database` taken at `version` lives.
pub fn backup_path(database: &Path, version: i64) -> PathBuf {
    let name = database
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| "agents.db".into());
    database.with_file_name(format!("{name}.v{version}.backup"))
}

/// Copies `database` aside before it is migrated away from `version`.
///
/// Version 0 is skipped, and the emptiness of the file is not the test for it.
/// By the time this runs, `configure` has already set `journal_mode`, so even
/// a brand-new database has a header and a non-zero length — but no migration
/// has run, so it holds no rows and there is nothing to lose. Only a database
/// that has reached version 1 or later has content worth a copy.
///
/// A copy that cannot be written *is* an error. Silently migrating without the
/// safety net is the one case where the user learns about it only after the
/// rows are gone.
pub fn before_migration(database: &Path, version: i64) -> CoreResult<()> {
    if version == 0 {
        return Ok(());
    }
    if std::fs::metadata(database).is_err() {
        return Ok(());
    }
    let target = backup_path(database, version);
    std::fs::copy(database, &target)?;
    crate::fsx::harden(&target);
    Ok(())
}
