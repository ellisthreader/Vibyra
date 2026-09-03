//! The pattern tests behind `bash_risk`.
//!
//! Split from the classifier itself so the table of what counts as a secret,
//! a deletion or a publish stays readable next to the decision that uses it.

use super::{GIT_READ, READ_ONLY};

/// `.env` as a file (or `.env.local`), not as the tail of "environment".
pub(super) fn mentions_env_file(lower: &str) -> bool {
    lower.match_indices(".env").any(|(index, _)| {
        !matches!(
            lower[index + 4..].chars().next(),
            Some(c) if c.is_ascii_alphanumeric() || c == '_'
        )
    })
}

/// `env` on its own dumps every variable; `env FOO=1 cmd` is a prefix.
pub(super) fn bare_env(lower: &str) -> bool {
    segments(lower).any(|segment| {
        let mut words = segment.split_whitespace();
        words.next() == Some("env") && words.all(|word| word.starts_with('-'))
    })
}

pub(super) fn rm_forced(lower: &str) -> bool {
    segments(lower).any(|segment| {
        let mut words = segment.split_whitespace();
        if words.next() != Some("rm") {
            return false;
        }
        words.any(|word| {
            word == "--recursive"
                || word == "--force"
                || (word.starts_with('-')
                    && !word.starts_with("--")
                    && word.contains(['r', 'f', 'R']))
        })
    })
}

pub(super) fn mutating_request(lower: &str) -> bool {
    segments(lower).any(|segment| {
        let words: Vec<&str> = segment.split_whitespace().collect();
        let Some(program) = words.first() else {
            return false;
        };
        if !["curl", "wget", "http", "httpie"].contains(program) {
            return false;
        }
        words
            .windows(2)
            .any(|pair| pair[0] == "-x" && ["post", "put", "delete", "patch"].contains(&pair[1]))
            || words.iter().any(|word| {
                matches!(
                    *word,
                    "-d" | "--data"
                        | "--data-raw"
                        | "--data-binary"
                        | "-f"
                        | "--form"
                        | "-t"
                        | "--upload-file"
                        | "--post-data"
                        | "--method=post"
                        | "--method=put"
                        | "--method=delete"
                ) || word.starts_with("-x")
            })
    })
}

/// Shell shapes that run a command the segment's first word does not name:
/// substitution, process substitution, and the flags that turn `find` or
/// `awk` into an executor. Interpreters and `sudo` need no entry — they are
/// not in `READ_ONLY`, so a segment starting with one is already a write.
const HIDDEN_EXEC: &[&str] = &[
    "$(",
    "`",
    "<(",
    ">(",
    "|&",
    " -exec",
    " -execdir",
    " -delete",
    " -ok",
    " -okdir",
    "system(",
];

/// Whether every segment of the line is a program that only reads.
///
/// Biased to fail closed: a false "write" costs one card, a false "read" is
/// the failure the whole broker exists to prevent. So the line is refused as
/// a read if it contains anything that could run a command its first word
/// does not name — `find -exec`, `$(...)`, an `awk` `system()` — before any
/// program name is looked at.
pub(super) fn read_only(command: &str) -> bool {
    let stripped = command
        .replace("2>&1", "")
        .replace("2>/dev/null", "")
        .replace("&>/dev/null", "");
    if stripped.contains('>') || stripped.trim().is_empty() {
        return false;
    }
    let padded = format!(" {} ", stripped.to_lowercase());
    if HIDDEN_EXEC.iter().any(|shape| padded.contains(shape)) {
        return false;
    }
    // A lone `&` backgrounds whatever precedes it and starts a new command.
    if padded.replace("&&", "").contains('&') {
        return false;
    }
    let every_segment_reads = segments(&stripped).all(|segment| {
        let words: Vec<&str> = segment
            .split_whitespace()
            .skip_while(|word| *word == "env" || (word.contains('=') && !word.starts_with('-')))
            .collect();
        let Some(program) = words.first() else {
            return true;
        };
        let program = program.rsplit('/').next().unwrap_or(program);
        match program {
            "git" => {
                words.get(1).is_some_and(|sub| GIT_READ.contains(sub))
                    && !words
                        .iter()
                        .any(|w| ["-d", "-D", "-m", "-M", "push", "pop", "drop"].contains(w))
            }
            "npm" => words
                .get(1)
                .is_some_and(|sub| ["ls", "view", "outdated", "-v"].contains(sub)),
            "cargo" => words
                .get(1)
                .is_some_and(|sub| ["metadata", "tree"].contains(sub)),
            "sed" => !words.iter().any(|w| w.starts_with("-i")),
            _ => READ_ONLY.contains(&program),
        }
    });
    every_segment_reads
}

fn segments(command: &str) -> impl Iterator<Item = &str> {
    command
        .split(['|', ';', '\n', '&'])
        .map(str::trim)
        .filter(|part| !part.is_empty())
}
