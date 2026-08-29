use std::ffi::OsStr;
use std::path::Path;

use serde::Serialize;

use crate::{CoreError, CoreResult};

use super::{gh, run};

// Which branch a pull request targets.
//
// `gh pr create` picks the repository's default branch when nothing says
// otherwise, and that is wrong the moment the agent was launched from a
// feature branch: the pull request then proposes the whole feature's history
// instead of the agent's change, and nobody can review it. The picker this
// feeds exists so the choice is made in the app rather than discovered on
// github.com afterwards.
//
// Both probes go through `gh`, so authorization stays in the official CLI and
// no token is ever seen here.

/// One page. A base picker is not a branch browser, and an unbounded fetch
/// against a repository with thousands of branches would stall the sheet the
/// user is trying to fill in.
const PER_PAGE: usize = 100;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoBranches {
    /// What `gh pr create` would have chosen on its own, so the picker can
    /// open on it and the default behaviour is visibly unchanged.
    pub default_branch: Option<String>,
    pub names: Vec<String>,
    /// True when the repository has more branches than one page holds, so the
    /// picker can say the list is partial rather than imply it is everything.
    pub truncated: bool,
}

/// The remote's branches, with the repository's default resolved.
pub fn list_branches(worktree: &Path) -> CoreResult<RepoBranches> {
    list_branches_with_path(worktree, None)
}

pub(crate) fn list_branches_with_path(
    worktree: &Path,
    path: Option<&OsStr>,
) -> CoreResult<RepoBranches> {
    let default_branch = run(gh(path).current_dir(worktree).args([
        "repo",
        "view",
        "--json",
        "defaultBranchRef",
        "--jq",
        ".defaultBranchRef.name",
    ]))
    .ok()
    .filter(|name| !name.is_empty());

    let endpoint = format!("repos/{{owner}}/{{repo}}/branches?per_page={PER_PAGE}");
    let raw = run(gh(path)
        .current_dir(worktree)
        .arg("api")
        .arg(&endpoint)
        .args(["--jq", ".[].name"]))
    .map_err(|detail| CoreError::Settings(format!("gh could not list the branches: {detail}")))?;

    Ok(collect(&raw, default_branch))
}

/// `vibyra/*` branches are ours. One of them is the pull request's own head,
/// and none of them is ever somebody's base, so they are dropped before the
/// user can pick one by mistake.
fn collect(raw: &str, default_branch: Option<String>) -> RepoBranches {
    let listed = raw
        .lines()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .count();
    let mut names: Vec<String> = raw
        .lines()
        .map(str::trim)
        .filter(|name| !name.is_empty() && !name.starts_with("vibyra/"))
        .map(String::from)
        .collect();

    // A busy repository can push the default off the first page, and a picker
    // that cannot offer the default is worse than no picker at all.
    if let Some(default) = default_branch.as_ref() {
        if !names.iter().any(|name| name == default) {
            names.insert(0, default.clone());
        }
    }
    RepoBranches {
        default_branch,
        names,
        truncated: listed >= PER_PAGE,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn our_own_branches_are_never_offered_as_a_base() {
        let listed = collect(
            "main\nvibyra/test-1\nrelease/0.2.8\n",
            Some("main".to_string()),
        );
        assert_eq!(listed.names, vec!["main", "release/0.2.8"]);
        assert!(!listed.truncated);
    }

    #[test]
    fn a_default_that_fell_off_the_page_is_still_offered() {
        let listed = collect("feature/a\nfeature/b\n", Some("main".to_string()));
        assert_eq!(listed.names.first().map(String::as_str), Some("main"));
    }

    #[test]
    fn a_full_page_reports_itself_as_partial() {
        let raw = (0..PER_PAGE)
            .map(|index| format!("branch-{index}\n"))
            .collect::<String>();
        assert!(collect(&raw, None).truncated);
    }
}
