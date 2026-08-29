use std::ffi::OsStr;
use std::path::Path;

use serde::Serialize;
use serde_json::Value;

use crate::{CoreError, CoreResult};

use super::{gh, run};

// What happened to the pull request after it left the app.
//
// Until now a PR was a one-shot exit: the sheet printed a link and the work
// disappeared from Vibyra forever, so "did it merge, can this workspace go?"
// was a question only github.com could answer.
//
// Fetched on demand and never polled. A timer over every open workspace would
// spend the user's API budget learning nothing, and `gh` is a process launch
// per call — the refresh is a button because the answer only matters when
// somebody is asking.

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrState {
    /// `OPEN`, `MERGED` or `CLOSED`, exactly as GitHub reports it.
    pub state: String,
    pub merged: bool,
    /// `none`, `pending`, `passing` or `failing` — the rollup of every check,
    /// graded pessimistically so a red run is never hidden by a green one.
    pub checks: String,
}

/// Reads one pull request's state through `gh`. The URL is the one `gh pr
/// create` printed, so nothing here has to guess at owner or number.
pub fn pr_state(worktree: &Path, url: &str) -> CoreResult<PrState> {
    pr_state_with_path(worktree, url, None)
}

pub(crate) fn pr_state_with_path(
    worktree: &Path,
    url: &str,
    path: Option<&OsStr>,
) -> CoreResult<PrState> {
    if !url.starts_with("https://github.com/") {
        return Err(CoreError::Settings("Not a GitHub pull request.".into()));
    }
    let raw = run(gh(path)
        .current_dir(worktree)
        .args(["pr", "view", url])
        .args(["--json", "state,statusCheckRollup"]))
    .map_err(|detail| {
        CoreError::Settings(format!("gh could not read the pull request: {detail}"))
    })?;
    parse(&raw)
}

fn parse(raw: &str) -> CoreResult<PrState> {
    let value: Value = serde_json::from_str(raw)
        .map_err(|error| CoreError::Settings(format!("gh returned unreadable JSON: {error}")))?;
    let state = value
        .get("state")
        .and_then(Value::as_str)
        .unwrap_or("OPEN")
        .to_string();
    let rollup = value
        .get("statusCheckRollup")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or_default();
    Ok(PrState {
        merged: state == "MERGED",
        checks: grade(rollup).to_string(),
        state,
    })
}

/// A check run reports `conclusion` once it finishes and an empty one while it
/// runs; a legacy status context reports `state` instead. Anything that is
/// neither finished nor recognised counts as still running, which is the
/// reading that cannot mislead.
fn grade(rollup: &[Value]) -> &'static str {
    if rollup.is_empty() {
        return "none";
    }
    let mut pending = false;
    for check in rollup {
        let verdict = check
            .get("conclusion")
            .and_then(Value::as_str)
            .filter(|value| !value.is_empty())
            .or_else(|| check.get("state").and_then(Value::as_str))
            .unwrap_or("");
        match verdict {
            "SUCCESS" | "NEUTRAL" | "SKIPPED" => {}
            "FAILURE" | "ERROR" | "TIMED_OUT" | "CANCELLED" | "ACTION_REQUIRED" => {
                return "failing"
            }
            _ => pending = true,
        }
    }
    if pending {
        "pending"
    } else {
        "passing"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_merged_pull_request_reports_itself_merged() {
        let state = parse(r#"{"state":"MERGED","statusCheckRollup":[]}"#).unwrap();
        assert!(state.merged);
        assert_eq!(state.checks, "none");
    }

    #[test]
    fn one_red_run_beats_every_green_one() {
        let state = parse(
            r#"{"state":"OPEN","statusCheckRollup":[
                {"conclusion":"SUCCESS"},{"conclusion":"FAILURE"}]}"#,
        )
        .unwrap();
        assert!(!state.merged);
        assert_eq!(state.checks, "failing");
    }

    #[test]
    fn a_run_with_no_conclusion_yet_is_pending_not_passing() {
        let state = parse(
            r#"{"state":"OPEN","statusCheckRollup":[
                {"conclusion":"SUCCESS"},{"conclusion":"","status":"IN_PROGRESS"}]}"#,
        )
        .unwrap();
        assert_eq!(state.checks, "pending");
    }

    #[test]
    fn a_legacy_status_context_is_read_through_its_state() {
        let state = parse(r#"{"state":"OPEN","statusCheckRollup":[{"state":"SUCCESS"}]}"#).unwrap();
        assert_eq!(state.checks, "passing");
    }
}
