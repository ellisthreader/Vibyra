//! A run's private folders: an empty `work/` cwd for Claude Code (no project
//! AGENTS.md/CLAUDE.md, memory or git state) and a sibling `ctl/` with the
//! MCP and broker configuration, and `attachments/` for the run's downloaded
//! files. All go away after the run, together with Claude Code's per-folder
//! project memory for `work/`.

use super::broker::BrokerConfig;
use super::claude_cmd::project_dir_name;
use super::tools::mcp_config;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

static BASE: OnceLock<PathBuf> = OnceLock::new();

/// Run folders live under this private app folder (set once at startup), not
/// in the shared temp directory, whose ancestors another local user may write
/// to (a planted `CLAUDE.md` above the run folder would be loaded, F-21).
pub fn use_private_base(dir: PathBuf) {
    let _ = BASE.set(dir);
}

pub fn private_base() -> Option<&'static Path> {
    BASE.get().map(PathBuf::as_path)
}

pub struct Workspace {
    root: Option<tempfile::TempDir>,
    pub work: PathBuf,
    /// Downloaded attachments; beside `work/`, so never inside Claude Code's cwd.
    pub attachments: PathBuf,
    pub mcp_config: PathBuf,
    pub armed: PathBuf,
}

fn private_write(path: &Path, text: &str) -> Result<(), String> {
    use std::io::Write;
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options
        .open(path)
        .and_then(|mut file| file.write_all(text.as_bytes()))
        .map_err(|_| "Could not prepare the Agent run folder.".to_string())
}

fn private_dir(path: &Path) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o700))
            .map_err(|_| "Could not prepare the Agent run folder.".to_string())?;
    }
    let _ = path;
    Ok(())
}

impl Workspace {
    /// Marks the run as live (the startup sweep leaves folders touched recently).
    pub fn keep_alive(&self) {
        if let Some(ctl) = self.mcp_config.parent() {
            let _ = std::fs::write(ctl.join("alive"), b"");
        }
    }

    /// `broker_program` is this app's own binary, started in broker mode.
    pub fn create(broker_program: &Path, config: &BrokerConfig) -> Result<Self, String> {
        Self::create_in(private_base(), broker_program, config)
    }

    /// `under`: the private folder for run folders, or the system temp directory.
    pub fn create_in(
        under: Option<&Path>,
        broker_program: &Path,
        config: &BrokerConfig,
    ) -> Result<Self, String> {
        let builder = {
            let mut builder = tempfile::Builder::new();
            builder.prefix(super::workspace_sweep::PREFIX);
            builder
        };
        let made = match under {
            Some(dir) => std::fs::create_dir_all(dir)
                .map_err(|e| e.to_string())
                .and_then(|_| private_dir(dir))
                .and_then(|_| builder.tempdir_in(dir).map_err(|e| e.to_string())),
            None => builder.tempdir().map_err(|e| e.to_string()),
        };
        let root = made.map_err(|_| "Could not create the Agent run folder.".to_string())?;
        // Claude Code names memory folders after the resolved cwd.
        // `tempfile` leaves the folder world-readable (0755); this one holds credentials.
        private_dir(root.path())?;
        let base = root.path().canonicalize().map_err(|e| e.to_string())?;
        let (work, ctl) = (base.join("work"), base.join("ctl"));
        let attachments = base.join("attachments");
        std::fs::create_dir(&work)
            .and_then(|_| std::fs::create_dir(&ctl))
            .and_then(|_| std::fs::create_dir(&attachments))
            .map_err(|_| "Could not create the Agent run folder.".to_string())?;
        // The run folder itself is 0700 (tempfile); its subfolders are too, so the
        // broker credentials and downloaded files are for this user only.
        private_dir(&ctl)?;
        private_dir(&attachments)?;
        let broker_config = ctl.join("broker.json");
        let mut config = config.clone();
        let armed = ctl.join("armed");
        config.armed_path = Some(armed.to_string_lossy().into_owned());
        private_write(
            &broker_config,
            &serde_json::to_string(&config).map_err(|e| e.to_string())?,
        )?;
        let mcp = mcp_config(
            &broker_program.to_string_lossy(),
            &broker_config.to_string_lossy(),
        );
        let mcp_path = ctl.join("mcp.json");
        private_write(&mcp_path, &mcp.to_string())?;
        Ok(Self {
            root: Some(root),
            work,
            attachments,
            mcp_config: mcp_path,
            armed,
        })
    }

    /// Deletes the run folder and the matching `projects/<cwd>` memory folder
    /// under each Claude config directory that may have recorded it.
    pub fn cleanup(mut self, config_dirs: &[PathBuf]) {
        let name = project_dir_name(&self.work);
        for dir in config_dirs {
            let memory = dir.join("projects").join(&name);
            if memory.starts_with(dir) && memory.file_name().is_some() {
                let _ = std::fs::remove_dir_all(memory);
            }
        }
        if let Some(root) = self.root.take() {
            let _ = root.close();
        }
    }
}

#[cfg(test)]
#[path = "workspace_tests.rs"]
mod tests;
