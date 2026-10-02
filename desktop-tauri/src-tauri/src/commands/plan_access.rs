use crate::state::AppState;

/// One admission at a time, held until the new terminal is registered, so two
/// launches racing cannot both take the last free slot.
type AdmissionGuard = tokio::sync::OwnedMutexGuard<()>;
static ADMISSION: std::sync::LazyLock<std::sync::Arc<tokio::sync::Mutex<()>>> =
    std::sync::LazyLock::new(|| std::sync::Arc::new(tokio::sync::Mutex::new(())));

async fn reserve_terminal(
    check: impl FnOnce() -> Result<(), String>,
) -> Result<AdmissionGuard, String> {
    let guard = ADMISSION.clone().lock_owned().await;
    check()?;
    Ok(guard)
}

fn reserve_resume(check: impl FnOnce() -> Result<(), String>) -> Result<AdmissionGuard, String> {
    // A resume holds the conversation action lock. Never wait here for a launch
    // that may itself be waiting for that action lock.
    let guard = ADMISSION
        .clone()
        .try_lock_owned()
        .map_err(|_| "Another terminal is starting. Try resuming again.".to_owned())?;
    check()?;
    Ok(guard)
}

pub(crate) fn admit_resume(
    account: &crate::account_session::AccountSessionManager,
    manager: &vibyra_core::pty::PtyManager,
    chats: &crate::shared_chats::SharedChats,
) -> Result<AdmissionGuard, String> {
    reserve_resume(|| {
        account
            .plan_limits()
            .admit_terminal(crate::plan_limits::running_terminals(manager, chats))
    })
}

/// Admit one more terminal under the account's plan, or explain the limit.
pub(super) async fn admit_terminal(state: &AppState) -> Result<AdmissionGuard, String> {
    reserve_terminal(|| {
        state
            .account
            .plan_limits()
            .admit_terminal(crate::plan_limits::running_terminals(
                &state.manager,
                &state.shared_chats,
            ))
    })
    .await
}

/// A folder inside a locked project (past the plan's project limit) is refused.
/// A folder in no saved project is not a project and is left to the terminal limit.
pub(crate) fn admit_project_path(state: &AppState, path: Option<&str>) -> Result<(), String> {
    let Some(path) = path.filter(|path| !path.is_empty()) else {
        return Ok(());
    };
    let position = crate::plan_limits::project_position(&state.settings.lock().projects, path);
    position.map_or(Ok(()), |position| {
        state.account.plan_limits().admit_project(position)
    })
}

pub(super) fn admit_project_id(state: &AppState, id: &str) -> Result<(), String> {
    let position = state
        .settings
        .lock()
        .projects
        .iter()
        .position(|project| project.id == id);
    position.map_or(Ok(()), |position| {
        state.account.plan_limits().admit_project(position)
    })
}

pub(crate) fn admit_review(state: &AppState) -> Result<(), String> {
    state.account.plan_limits().admit_review()
}

pub(super) fn admit_safe_worktrees(state: &AppState) -> Result<(), String> {
    state.account.plan_limits().admit_safe_worktrees()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn starts_and_resumes_hold_one_admission_until_registration() {
        let first = reserve_terminal(|| Ok(())).await.unwrap();
        assert!(reserve_resume(|| panic!(
            "a racing resume must not inspect an unregistered launch"
        ))
        .is_err());
        drop(first);
        assert!(reserve_resume(|| Err("plan-limit:terminals: Full".into())).is_err());
        let resumed = reserve_resume(|| Ok(())).unwrap();
        let mut next = Box::pin(reserve_terminal(|| Ok(())));
        assert!(
            tokio::time::timeout(std::time::Duration::from_millis(20), &mut next)
                .await
                .is_err()
        );
        drop(resumed);
        assert!(
            tokio::time::timeout(std::time::Duration::from_secs(1), next)
                .await
                .unwrap()
                .is_ok()
        );
    }
}
