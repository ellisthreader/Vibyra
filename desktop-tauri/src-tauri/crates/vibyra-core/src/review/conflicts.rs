// `git apply` names the files it could not land in more than one shape, and
// under `--3way` it can name them while still exiting 0 — a patch it "applied
// with conflicts" would leave markers in the user's checkout, which this
// module treats as a refusal rather than a success.

/// Files git said were in the way, plus a sentence when it would not say.
/// For a run that already failed, so every shape counts.
pub(super) fn blocked(stderr: &str) -> Vec<String> {
    let paths = collect(stderr, |line| named(line).or_else(|| errored(line)));
    if paths.is_empty() {
        return vec!["the patch could not be applied".to_string()];
    }
    paths
}

/// Files a *successful* run resolved with conflict markers. Deliberately
/// blind to `error:` lines: three-way narrates its fallbacks there even when
/// the file goes on to apply perfectly well, and reading those as conflicts
/// would refuse merges that work.
pub(super) fn unresolved(stderr: &str) -> Vec<String> {
    collect(stderr, named)
}

fn collect(stderr: &str, read: impl Fn(&str) -> Option<String>) -> Vec<String> {
    let mut paths: Vec<String> = stderr
        .lines()
        .filter_map(|line| read(line.trim()))
        .filter(|path| !path.is_empty())
        .collect();
    paths.sort();
    paths.dedup();
    paths
}

/// `Applied patch to '<path>' with conflicts.` — quoted, so no field guessing.
fn named(line: &str) -> Option<String> {
    line.strip_prefix("Applied patch to '")?
        .split_once("' with conflicts")
        .map(|(path, _)| path.to_string())
}

/// `error: patch failed: <path>:<line>` or `error: <path>: <reason>`.
fn errored(line: &str) -> Option<String> {
    let rest = line.strip_prefix("error: ")?;
    Some(leading_path(
        rest.strip_prefix("patch failed: ").unwrap_or(rest),
    ))
}

/// Splitting on `:` to drop the trailing line number or reason turns
/// `C:\src\foo.rs` into `C`. A lone letter followed by a separator is a
/// Windows drive, not a field — `docs/windows-support.md` makes that real.
fn leading_path(text: &str) -> String {
    let mut fields = text.split(':');
    let head = fields.next().unwrap_or_default();
    if head.len() == 1 && head.starts_with(|first: char| first.is_ascii_alphabetic()) {
        if let Some(rest) = fields.next() {
            if rest.starts_with(['\\', '/']) {
                return format!("{head}:{rest}").trim().to_string();
            }
        }
    }
    head.trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_windows_drive_letter_is_not_a_field() {
        let stderr = "error: patch failed: C:\\src\\foo.rs:12\n\
                      error: C:\\src\\foo.rs: patch does not apply\n\
                      error: patch failed: src/bar.rs:3\n";
        assert_eq!(
            blocked(stderr),
            vec!["C:\\src\\foo.rs".to_string(), "src/bar.rs".to_string()]
        );
    }

    #[test]
    fn a_clean_three_way_run_reports_nothing_and_a_conflicted_one_reports_the_file() {
        let clean = "Falling back to three-way merge...\nApplied patch to 'src/a.rs' cleanly.\n";
        assert!(unresolved(clean).is_empty());
        // Git narrates its fallbacks as errors even when the file lands.
        assert!(unresolved("error: repository lacks the necessary blob\n").is_empty());
        assert_eq!(
            unresolved("Applied patch to 'src/a.rs' with conflicts.\n"),
            vec!["src/a.rs".to_string()]
        );
        assert_eq!(
            blocked(""),
            vec!["the patch could not be applied".to_string()]
        );
    }
}
