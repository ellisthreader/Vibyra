//! The Agent Mode schema, as a list of numbered migrations.
//!
//! Each migration is a slice of SQL chunks applied inside one transaction,
//! after which its number is written to `user_version`. A half-applied upgrade
//! therefore cannot exist: either the whole step lands or the file is
//! untouched. Migrations are append-only — editing a shipped statement would
//! leave installs that already ran it disagreeing with installs that never did.
//!
//! The chunks are only a file-size split; SQLite sees one script per migration.

/// Migration 2: a handoff that became a decision remembers which one, so the
/// answer can find the message it is about.
const MAIL_APPROVAL_LINK: &str = "ALTER TABLE agent_mail ADD COLUMN approval_id TEXT;";

/// Every migration, oldest first. An entry's index plus one is its version.
pub const MIGRATIONS: &[&[&str]] = &[
    &[
        super::schema_agents::AGENTS_AND_CHATS,
        super::schema_work::SKILLS_AND_WORK,
    ],
    &[MAIL_APPROVAL_LINK],
];

/// What a fresh database is created at, and what an old one is upgraded to.
pub fn target_version() -> i64 {
    MIGRATIONS.len() as i64
}
