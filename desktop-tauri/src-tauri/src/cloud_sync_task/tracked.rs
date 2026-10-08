//! The projects this app has synced, remembered by their app id so that a project
//! the user later closes can still be removed from the cloud (the engine keys its
//! own state by a one-way hash of the id, which cannot be turned back).
//! Holds no secrets: ids, display names and folders only.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use vibyra_sync::ProjectRef;

#[derive(Serialize, Deserialize, Clone)]
struct Entry {
    name: String,
    root: String,
}

pub struct Tracked {
    file: PathBuf,
}

impl Tracked {
    pub fn new(state_dir: &Path) -> Self {
        Tracked {
            file: state_dir.join("cloud-sync").join("app-projects.json"),
        }
    }

    fn load(&self) -> BTreeMap<String, Entry> {
        std::fs::read(&self.file)
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default()
    }

    fn save(&self, map: &BTreeMap<String, Entry>) {
        if let (Some(parent), Ok(bytes)) = (self.file.parent(), serde_json::to_vec_pretty(map)) {
            let _ = std::fs::create_dir_all(parent);
            let tmp = self.file.with_extension("json.tmp");
            if std::fs::write(&tmp, bytes).is_ok() {
                let _ = std::fs::rename(&tmp, &self.file);
            }
        }
    }

    pub fn all(&self) -> Vec<ProjectRef> {
        self.load()
            .into_iter()
            .map(|(id, e)| ProjectRef {
                id,
                name: e.name,
                root: PathBuf::from(e.root),
            })
            .collect()
    }

    pub fn remember(&self, project: &ProjectRef) {
        let mut map = self.load();
        let entry = Entry {
            name: project.name.clone(),
            root: project.root.to_string_lossy().into_owned(),
        };
        let unchanged = map
            .get(&project.id)
            .is_some_and(|e| e.name == entry.name && e.root == entry.root);
        if !unchanged {
            map.insert(project.id.clone(), entry);
            self.save(&map);
        }
    }

    pub fn forget(&self, project: &ProjectRef) {
        let mut map = self.load();
        if map.remove(&project.id).is_some() {
            self.save(&map);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn remembers_and_forgets_without_duplicates() {
        let dir = tempfile::tempdir().unwrap();
        let t = Tracked::new(dir.path());
        let p = ProjectRef {
            id: "p1".into(),
            name: "App".into(),
            root: PathBuf::from("/x/app"),
        };
        t.remember(&p);
        t.remember(&p);
        assert_eq!(t.all().len(), 1);
        assert_eq!(t.all()[0].root, PathBuf::from("/x/app"));
        t.forget(&p);
        assert!(t.all().is_empty());
    }
}
