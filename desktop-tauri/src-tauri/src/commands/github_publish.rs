//! Putting a freshly built project onto a GitHub repository the backend has
//! just created.
//!
//! The repository is made server-side with the account's connector token; the
//! push happens here, with the computer's own git credentials. That split is
//! deliberate: a token Vibyra holds may create an empty repository, but it
//! never gains the power to write somebody's source. If this machine has no
//! git credentials for GitHub the push fails and says so, which is the honest
//! outcome — it is the same credential `git push` would need in a terminal.
//!
//! The steps reuse `vibyra_core::scaffold::run_step`, so they inherit the same
//! argv-only spawning, the sanitised environment, the stall guard and the
//! process-group cancel the build itself uses.

use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use tauri::ipc::Channel;
use tauri::State;
use vibyra_core::scaffold::{run_step, ScaffoldStep, StepOutcome};

use super::run_blocking;
use super::scaffold::{ScaffoldEvent, ScaffoldResult};
use crate::state::AppState;

/// `https://github.com/owner/name.git` and nothing else. The remote is argv, so
/// it could never become a command, but a URL from somewhere other than the
/// repository we just created has no business being pushed to either.
fn remote_allowed(remote: &str) -> bool {
    remote.starts_with("https://github.com/")
        && remote.ends_with(".git")
        && remote.len() < 300
        && !remote.contains(|c: char| c.is_whitespace())
        && !remote.contains('@')
}

fn steps(dir: &str, remote: &str, branch: &str) -> Vec<ScaffoldStep> {
    let step = |label: &str, args: &[&str]| ScaffoldStep {
        label: label.to_owned(),
        program: "git".to_owned(),
        args: args.iter().map(|a| (*a).to_owned()).collect(),
        cwd: dir.to_owned(),
    };
    vec![
        // `init` is safe to repeat: the template may already have made a
        // repository, and the build's own `git init` may have run.
        step("Preparing the repository", &["init"]),
        step("Staging the project", &["add", "-A"]),
        step(
            "Making the first commit",
            &["commit", "-m", "Initial commit", "--allow-empty"],
        ),
        step("Naming the branch", &["branch", "-M", branch]),
        step(
            "Adding the GitHub remote",
            &["remote", "add", "origin", remote],
        ),
        step("Pushing to GitHub", &["push", "-u", "origin", branch]),
    ]
}

#[tauri::command]
pub async fn github_publish(
    state: State<'_, AppState>,
    run_id: String,
    dir: String,
    remote: String,
    branch: String,
    on_event: Channel<ScaffoldEvent>,
) -> Result<ScaffoldResult, String> {
    if !remote_allowed(&remote) {
        return Err("That is not a GitHub repository address.".into());
    }
    let branch = if branch.is_empty() {
        "main".to_owned()
    } else {
        branch
    };
    let cancel = Arc::new(AtomicBool::new(false));
    let runs = Arc::clone(&state.scaffold_runs);
    runs.lock().insert(run_id.clone(), Arc::clone(&cancel));
    let result =
        run_blocking(move || Ok(execute(&dir, &remote, &branch, &on_event, &cancel))).await;
    runs.lock().remove(&run_id);
    result
}

fn execute(
    dir: &str,
    remote: &str,
    branch: &str,
    on_event: &Channel<ScaffoldEvent>,
    cancel: &AtomicBool,
) -> ScaffoldResult {
    let steps = steps(dir, remote, branch);
    let total = steps.len();
    for (index, step) in steps.iter().enumerate() {
        let _ = on_event.send(ScaffoldEvent::Step {
            index,
            total,
            label: step.label.clone(),
        });
        let emit = |data: String| {
            let _ = on_event.send(ScaffoldEvent::Line { data });
        };
        match run_step(step, &emit, cancel) {
            Ok(StepOutcome::Finished(0)) => {}
            // A remote that is already there is the ordinary shape of a retry,
            // and a commit with nothing to commit is not a failure either.
            Ok(StepOutcome::Finished(_))
                if step
                    .args
                    .first()
                    .is_some_and(|a| a == "remote" || a == "commit") => {}
            Ok(StepOutcome::Finished(code)) => {
                return failed(format!("{} stopped with exit code {code}.", step.label));
            }
            Ok(StepOutcome::Stalled) => {
                return ScaffoldResult {
                    ok: false,
                    message: Some(
                        "Git is waiting for a GitHub sign-in on this computer. Push it yourself from a terminal."
                            .into(),
                    ),
                    stalled: true,
                };
            }
            Ok(StepOutcome::Cancelled) => return failed("Cancelled.".into()),
            Err(error) => return failed(error.to_string()),
        }
    }
    ScaffoldResult {
        ok: true,
        message: None,
        stalled: false,
    }
}

fn failed(message: String) -> ScaffoldResult {
    ScaffoldResult {
        ok: false,
        message: Some(message),
        stalled: false,
    }
}

#[cfg(test)]
mod tests {
    use super::{remote_allowed, steps};

    #[test]
    fn only_a_github_repository_address_is_pushed_to() {
        assert!(remote_allowed("https://github.com/octocat/my-app.git"));
        for remote in [
            "https://gitlab.com/octocat/my-app.git",
            "https://user:pass@github.com/octocat/my-app.git",
            "git@github.com:octocat/my-app.git",
            "https://github.com/octocat/my-app",
            "https://github.com/octocat/my app.git",
            "file:///etc/passwd",
        ] {
            assert!(!remote_allowed(remote), "{remote}");
        }
    }

    #[test]
    fn every_step_is_argv_in_the_project_folder() {
        let steps = steps(
            "/tmp/my-app",
            "https://github.com/octocat/my-app.git",
            "main",
        );
        assert_eq!(steps.len(), 6);
        assert!(steps
            .iter()
            .all(|s| s.program == "git" && s.cwd == "/tmp/my-app"));
        assert!(steps.last().unwrap().args.contains(&"push".to_owned()));
    }
}
