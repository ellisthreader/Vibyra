//! Metadata only. Discovery never captures a frame or authorizes input.
use crate::window_preview::{self, WindowInfo};
use std::path::PathBuf;

#[derive(Clone)]
pub(super) struct OwnedWindow {
    pub project: String,
    pub project_root: PathBuf,
    pub root: PathBuf,
    pub info: WindowInfo,
}
impl OwnedWindow {
    pub fn target(&self) -> String {
        format!("native-window:{}:{}:view", self.info.pid, self.info.id)
    }
    /// What the phone gets once the owner picks the window: see and tap it.
    pub fn control_target(&self) -> String {
        format!("native-window:{}:{}:control", self.info.pid, self.info.id)
    }
    pub fn same(&self, other: &Self) -> bool {
        self.project == other.project
            && self.project_root == other.project_root
            && self.root == other.root
            && self.info.fingerprint == other.info.fingerprint
    }
}

/// Header and chat card can ask together; coalesce OS metadata reads briefly.
pub(super) fn cached(projects: &[(String, PathBuf)]) -> Result<Vec<OwnedWindow>, String> {
    use std::{
        sync::OnceLock,
        time::{Duration, Instant},
    };
    type Cache = Option<(
        Vec<(String, PathBuf)>,
        Instant,
        Result<Vec<OwnedWindow>, String>,
    )>;
    static CACHE: OnceLock<parking_lot::Mutex<Cache>> = OnceLock::new();
    let mut cached = CACHE.get_or_init(Default::default).lock();
    if let Some((roots, at, result)) = cached.as_ref() {
        if roots == projects && at.elapsed() < Duration::from_secs(3) {
            return result.clone();
        }
    }
    let result = scan(projects);
    *cached = Some((projects.to_vec(), Instant::now(), result.clone()));
    result
}

pub(super) fn scan(projects: &[(String, PathBuf)]) -> Result<Vec<OwnedWindow>, String> {
    use std::collections::BTreeSet;
    let roots: Vec<_> = projects
        .iter()
        .filter_map(|(id, root)| root.canonicalize().ok().map(|root| (id.clone(), root)))
        .collect();
    if roots.is_empty() {
        return Ok(Vec::new());
    }
    let windows = window_preview::list()?;
    let pids = windows
        .iter()
        .filter_map(|w| u32::try_from(w.pid).ok())
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();
    let directories = super::discovery_system::cwds(&pids);
    Ok(windows
        .into_iter()
        .filter_map(|info| {
            if info.pid == std::process::id() as i32 {
                return None;
            }
            let cwd = directories.get(&(info.pid as u32))?;
            let (project, project_root, root) = super::discovery::owner(&roots, cwd)?;
            // Cwd lookup and window inventory can race a process exit/reuse.
            let target = window_preview::Target {
                id: info.id,
                pid: info.pid,
                control: false,
            };
            if target.info().ok()?.fingerprint != info.fingerprint {
                return None;
            }
            Some(OwnedWindow {
                project,
                project_root,
                root,
                info,
            })
        })
        .take(64)
        .collect())
}

pub(super) fn signature() -> Vec<String> {
    let mut windows = crate::window_preview::list()
        .unwrap_or_default()
        .into_iter()
        .map(|window| window.fingerprint)
        .collect::<Vec<_>>();
    windows.sort();
    windows
}
