use super::Slot;
use serde::{Deserialize, Serialize};
use std::{
    path::{Path, PathBuf},
    sync::Arc,
};
use vibyra_engine::Engine;

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Project {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub root: PathBuf,
    pub account_id: String,
    #[serde(default = "default_provider")]
    pub provider: String,
}
fn default_provider() -> String {
    "codex".into()
}
impl Project {
    pub fn new(
        project_id: String,
        name: String,
        root: PathBuf,
        account_id: String,
    ) -> Result<Self, String> {
        let mut bytes = [0u8; 16];
        getrandom::fill(&mut bytes).map_err(|e| e.to_string())?;
        Ok(Self {
            id: bytes.iter().map(|b| format!("{b:02x}")).collect(),
            project_id,
            name,
            root: std::fs::canonicalize(root).map_err(|e| e.to_string())?,
            account_id,
            provider: "codex".into(),
        })
    }
}
pub(super) fn open(path: &Path, project: &Project) -> Result<Arc<Engine>, String> {
    if project.id.len() != 32 || !project.id.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("Invalid shared chat storage identity".into());
    }
    let home = crate::provider_auth_registry::Registry::load()
        .home(&project.provider, &project.account_id)?;
    let environment = match project.provider.as_str() {
        "codex" => vec![(
            "CODEX_HOME".to_owned(),
            home.credentials_dir().to_string_lossy().into_owned(),
        )],
        "claude" | "gemini" => home.env().into_iter().collect(),
        _ => return Err("Unsupported shared conversation provider".into()),
    };
    Engine::for_desktop_provider(
        path.join(&project.id),
        project.project_id.clone(),
        project.name.clone(),
        project.root.clone(),
        project.provider.clone(),
        project.provider.clone().into(),
        environment,
    )
    .map(Arc::new)
}
pub(super) fn load(path: &Path) -> Result<Vec<Slot>, String> {
    let bytes = match std::fs::read(path.join("projects.json")) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
        Err(error) => return Err(error.to_string()),
    };
    let projects: Vec<Project> = serde_json::from_slice(&bytes)
        .map_err(|e| format!("Shared chat registry could not be read: {e}"))?;
    if projects.len() > 32 {
        return Err("Shared chat registry exceeds its limit".into());
    }
    projects
        .into_iter()
        .map(|project| {
            Ok(Slot {
                engine: open(path, &project)?,
                project,
            })
        })
        .collect()
}
pub(super) fn save(path: &Path, projects: &[Project]) -> Result<(), String> {
    std::fs::create_dir_all(path).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o700))
            .map_err(|e| e.to_string())?;
    }
    let bytes = serde_json::to_vec(projects).map_err(|e| e.to_string())?;
    vibyra_core::fsx::write_private_atomic(&path.join("projects.json"), &bytes)
        .map_err(|e| e.to_string())
}
