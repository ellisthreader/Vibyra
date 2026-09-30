//! Phone project changes never route through an unrestricted settings snapshot.
use super::phone_effects::PhoneEffect;
use crate::state::AppState;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};
use vibyra_core::settings::ProjectSpec;

#[tauri::command]
pub async fn phone_project_mutate(app: AppHandle, id: String) -> Result<Value, String> {
    let effect = PhoneEffect::capture(
        &app.state::<AppState>(),
        Some(&id),
        &["adopt", "rename", "forget"],
        None,
        None,
    )?
    .ok_or("Missing phone authorization")?;
    super::run_blocking(move || {
        super::phone_effects::scoped(Some(effect), |effect| {
            let effect = effect.as_ref().ok_or("Missing phone authorization")?;
            let state = app.state::<AppState>();
            let request = effect.request();
            let action = request["action"].as_str().ok_or("Missing project action")?;
            let _write = state.settings_write.lock();
            let mut settings = state.settings.lock().clone();
            let project = if action == "adopt" {
                let path =
                    std::path::Path::new(request["path"].as_str().ok_or("Missing project folder")?)
                        .canonicalize()
                        .map_err(|_| "This project folder is unavailable")?;
                if !path.is_dir() {
                    return Err("Select a project folder".into());
                }
                let root = path.to_string_lossy().to_string();
                if let Some(existing) = settings.projects.iter().find(|p| p.root == root) {
                    existing.clone()
                } else {
                    let mut bytes = [0u8; 16];
                    getrandom::fill(&mut bytes).map_err(|e| e.to_string())?;
                    let id = format!(
                        "p-{}",
                        bytes.iter().map(|b| format!("{b:02x}")).collect::<String>()
                    );
                    let project = ProjectSpec {
                        id,
                        root,
                        name: request["name"]
                            .as_str()
                            .unwrap_or("Project")
                            .trim()
                            .chars()
                            .take(120)
                            .collect(),
                        color: "#5b7cfa".into(),
                        last_opened_ms: 0,
                    };
                    settings.projects.push(project.clone());
                    project
                }
            } else {
                let id = request["projectId"].as_str().ok_or("Missing project")?;
                let project = settings
                    .projects
                    .iter()
                    .find(|p| p.id == id)
                    .cloned()
                    .ok_or("This project is no longer open")?;
                effect.project_directory(&project.root)?;
                if action == "rename" {
                    let name = request["name"]
                        .as_str()
                        .ok_or("Missing project name")?
                        .trim();
                    if name.is_empty() {
                        return Err("Enter a project name".into());
                    }
                    settings
                        .projects
                        .iter_mut()
                        .find(|p| p.id == id)
                        .unwrap()
                        .name = name.chars().take(120).collect();
                } else {
                    effect.check()?;
                    state.shared_chats.remove_project(id)?;
                    effect.check()?;
                    state
                        .preview
                        .stop_project(&project.root)
                        .map_err(|e| e.to_string())?;
                    let panes = state.phone.lock().project_terminal_ids(id);
                    for pane in panes {
                        effect.check()?;
                        state.manager.remove(pane).map_err(|e| e.to_string())?;
                        state.sink.detach(pane);
                    }
                    settings.projects.retain(|p| p.id != id);
                    if settings.active_project_id.as_deref() == Some(id) {
                        settings.active_project_id = None;
                    }
                }
                settings
                    .projects
                    .iter()
                    .find(|p| p.id == project.id)
                    .cloned()
                    .unwrap_or(project)
            };
            if action == "adopt" {
                settings.active_project_id = Some(project.id.clone());
            }
            effect.check()?;
            settings
                .save_to(&state.settings_path)
                .map_err(|e| e.to_string())?;
            *state.settings.lock() = settings;
            Ok(json!({"id":project.id,"name":project.name,"path":project.root}))
        })
    })
    .await
}
