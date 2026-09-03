//! What a shell command is about to do, judged from its text.
//!
//! Biased toward asking: an unrecognised command is a write, never a read, and
//! anything that leaves the machine or removes something is named as such
//! before the read-only check is even reached. A false "ask" costs one card; a
//! false "allow" is the failure the whole broker exists to prevent.

use super::risk::Risk;

const SECRET: &[&str] = &[
    ".pem",
    "id_rsa",
    "id_ed25519",
    ".netrc",
    ".aws/credentials",
    "gh auth token",
    "security find-",
    "keyring",
    "pass show",
    "printenv",
    // Another process's argv or environment: where a bridge token would be.
    "/proc/",
];

const DESTRUCTIVE: &[&str] = &[
    "git reset --hard",
    "git clean",
    "git push --force",
    "git push -f",
    "--force-with-lease",
    "git branch -d",
    "git branch --delete",
    "git checkout -- .",
    "git restore .",
    "drop table",
    "drop database",
    "mkfs",
    "truncate ",
];

const PUBLISH: &[&str] = &[
    "git push",
    "gh pr ",
    "gh release",
    "gh issue create",
    "npm publish",
    "cargo publish",
    "scp ",
    "rsync ",
    "ssh ",
    "sendmail",
    "mail -s",
];

const READ_ONLY: &[&str] = &[
    "ls", "cat", "head", "tail", "less", "grep", "rg", "egrep", "fgrep", "find", "fd", "wc", "pwd",
    "which", "whereis", "type", "echo", "printf", "stat", "file", "du", "df", "tree", "diff",
    "sort", "uniq", "cut", "awk", "jq", "basename", "dirname", "realpath", "readlink", "date",
    "uname", "whoami", "id", "hostname", "true", "test", "[", "cd",
];

const GIT_READ: &[&str] = &[
    "status",
    "log",
    "diff",
    "show",
    "branch",
    "rev-parse",
    "ls-files",
    "blame",
    "remote",
    "describe",
    "tag",
    "stash",
    "--version",
];

/// The risk class of one shell command line.
pub fn bash_risk(command: &str) -> Risk {
    let lower = command.to_lowercase();
    if SECRET.iter().any(|pattern| lower.contains(pattern))
        || mentions_env_file(&lower)
        || bare_env(&lower)
    {
        return Risk::Secret;
    }
    if DESTRUCTIVE.iter().any(|pattern| lower.contains(pattern))
        || rm_forced(&lower)
        || lower.contains(" dd ")
        || lower.starts_with("dd ")
    {
        return Risk::Destructive;
    }
    if PUBLISH.iter().any(|pattern| lower.contains(pattern)) || mutating_request(&lower) {
        return Risk::Publish;
    }
    if read_only(command) {
        Risk::Read
    } else {
        Risk::Write
    }
}

#[path = "shell_patterns.rs"]
mod patterns;
use patterns::{bare_env, mentions_env_file, mutating_request, read_only, rm_forced};
