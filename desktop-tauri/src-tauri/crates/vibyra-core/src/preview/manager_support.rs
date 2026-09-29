use std::env;
use std::path::{Path, PathBuf};
use std::time::Duration;

use crate::CoreResult;

use super::manager::Shared;
use super::service::PreviewRuntime;

/// How long dev servers get to exit on their own when the app quits, shared
/// by all of them rather than spent one after another.
const QUIT_GRACE: Duration = Duration::from_millis(400);

pub(super) fn stop_services(services: impl Iterator<Item = Shared>) {
    let services = services.collect::<Vec<_>>();
    let mut guards = services
        .iter()
        .map(|service| service.lock())
        .collect::<Vec<_>>();
    let mut children = Vec::new();
    for service in guards.iter_mut() {
        match &mut service.runtime {
            PreviewRuntime::Static(server) => server.stop(),
            PreviewRuntime::Processes(list) => {
                children.extend(list.iter_mut().map(|managed| &mut managed.child));
            }
            PreviewRuntime::Desktop(run) => children.push(&mut run.child.child),
        }
    }
    crate::process_group::stop_all(children, QUIT_GRACE);
}

pub(super) struct ServiceIdentity {
    pub root: String,
    pub key: String,
}

impl ServiceIdentity {
    pub fn new(root: &str, target_id: &str) -> CoreResult<Self> {
        let root = stable_root(root)?.to_string_lossy().into_owned();
        let key = format!("{root}\0{target_id}");
        Ok(Self { root, key })
    }
}

pub(super) fn stable_root(root: &str) -> CoreResult<PathBuf> {
    let root = Path::new(root);
    let absolute = if root.is_absolute() {
        root.to_owned()
    } else {
        env::current_dir()?.join(root)
    };
    Ok(absolute.components().collect())
}
