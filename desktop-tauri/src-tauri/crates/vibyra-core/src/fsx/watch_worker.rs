use std::collections::BTreeMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{Receiver, RecvTimeoutError};
use std::sync::Arc;
use std::time::{Duration, Instant};

use notify::event::{CreateKind, ModifyKind, RemoveKind};
use notify::{Event, EventKind, RecommendedWatcher};

use super::{tree::RegisteredTree, FsChange};

const DEBOUNCE: Duration = Duration::from_millis(300);
const MAX_CHANGES: usize = 128;

pub(super) fn run(
    mut watcher: RecommendedWatcher,
    mut tree: RegisteredTree,
    events: Receiver<Option<Event>>,
    stop: Arc<AtomicBool>,
    overflow: Arc<AtomicBool>,
    on_changes: impl Fn(Vec<FsChange>),
) {
    let mut pending = BTreeMap::new();
    let mut deadline = Instant::now() + DEBOUNCE;
    let mut refresh = false;
    while !stop.load(Ordering::Acquire) {
        match events.recv_timeout(deadline.saturating_duration_since(Instant::now())) {
            Ok(Some(event)) => {
                let kind = match event.kind {
                    EventKind::Create(_) => "create",
                    EventKind::Remove(_) => "remove",
                    EventKind::Modify(_) => "modify",
                    _ => continue,
                };
                refresh |= matches!(
                    event.kind,
                    EventKind::Create(CreateKind::Folder | CreateKind::Any)
                        | EventKind::Remove(RemoveKind::Folder | RemoveKind::Any)
                        | EventKind::Modify(ModifyKind::Name(_) | ModifyKind::Any)
                );
                for path in event.paths {
                    if !tree.includes(&path) {
                        continue;
                    }
                    refresh |= path.is_dir();
                    if pending.len() < MAX_CHANGES || pending.contains_key(&path) {
                        pending.insert(path, kind);
                    }
                }
            }
            Ok(None) | Err(RecvTimeoutError::Disconnected) => break,
            Err(RecvTimeoutError::Timeout) => {}
        }
        if Instant::now() < deadline {
            continue;
        }
        if overflow.swap(false, Ordering::AcqRel) {
            refresh = true;
            pending.insert(tree.root.clone(), "modify");
        }
        if refresh {
            let _ = tree.refresh(&mut watcher);
            pending.insert(tree.root.clone(), "modify");
            refresh = false;
        }
        if !pending.is_empty() && !stop.load(Ordering::Acquire) {
            let changes = std::mem::take(&mut pending)
                .into_iter()
                .take(MAX_CHANGES)
                .map(|(path, kind)| FsChange {
                    path: path.to_string_lossy().into_owned(),
                    kind: kind.into(),
                })
                .collect();
            on_changes(changes);
        }
        deadline = Instant::now() + DEBOUNCE;
    }
}
