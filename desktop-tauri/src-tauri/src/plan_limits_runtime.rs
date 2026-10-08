use super::PlanLimits;
use std::path::PathBuf;
use vibyra_core::settings::ProjectSpec;

/// The running app, registered once at startup so code without an `AppState`
/// in hand (the phone's request handler) can read the plan. Unregistered, as
/// in unit tests, everything stays open.
static APP: std::sync::OnceLock<tauri::AppHandle> = std::sync::OnceLock::new();

pub fn register(app: tauri::AppHandle) {
    let _ = APP.set(app);
}

pub fn current() -> PlanLimits {
    use tauri::Manager;
    APP.get()
        .map(|app| app.state::<crate::state::AppState>().account.plan_limits())
        .unwrap_or_default()
}

/// Whether one more project can be added to what is saved now.
pub fn admit_new_project() -> Result<(), String> {
    use tauri::Manager;
    let Some(app) = APP.get() else { return Ok(()) };
    let state = app.state::<crate::state::AppState>();
    let saved = state.settings.lock().projects.len();
    state.account.plan_limits().admit_project(saved)
}

/// Which saved project a folder belongs to, by position (oldest first). The
/// deepest matching root wins, so a project nested in another is its own.
pub fn project_position(projects: &[ProjectSpec], path: &str) -> Option<usize> {
    let path = canonical(path);
    projects
        .iter()
        .enumerate()
        .filter_map(|(index, project)| {
            let root = canonical(&project.root);
            path.starts_with(&root)
                .then_some((index, root.components().count()))
        })
        .max_by_key(|(_, depth)| *depth)
        .map(|(index, _)| index)
}

fn canonical(path: &str) -> PathBuf {
    std::fs::canonicalize(path).unwrap_or_else(|_| PathBuf::from(path))
}

/// Running terminals of every kind: panes (agent, shell or SSH) and Chat view
/// conversations. Suspended or exited panes are not running and do not count.
pub fn running_terminals(
    manager: &vibyra_core::pty::PtyManager,
    chats: &crate::shared_chats::SharedChats,
) -> usize {
    manager
        .list()
        .iter()
        .filter(|session| session.alive)
        .count()
        + chats.running()
}

pub fn setup(app: tauri::AppHandle) {
    use tauri::Manager;
    register(app.clone());
    let admission_app = app.clone();
    app.state::<crate::state::AppState>()
        .preview
        .set_admission(std::sync::Arc::new(move |root| {
            let state = admission_app.state::<crate::state::AppState>();
            state.account.plan_limits().admit_preview()?;
            crate::commands::plan_access::admit_project_path(&state, Some(root))
        }));
}
