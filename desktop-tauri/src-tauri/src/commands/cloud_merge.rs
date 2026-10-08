use super::cloud_files::{self, CloudFile};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::Path,
};

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Review {
    pub changes: Vec<String>,
    pub conflicts: Vec<String>,
    pub digest: String,
}
pub fn review(root: &Path, base: &[CloudFile], current: &[CloudFile]) -> Result<Review, String> {
    cloud_files::validate(base)?;
    cloud_files::validate(current)?;
    let a: BTreeMap<_, _> = base.iter().map(|f| (&f.path, f)).collect();
    let b: BTreeMap<_, _> = current.iter().map(|f| (&f.path, f)).collect();
    let paths: BTreeSet<_> = a.keys().chain(b.keys()).copied().collect();
    let mut changes = vec![];
    let mut conflicts = vec![];
    let mut evidence = vec![];
    for path in paths {
        let old = a.get(path).copied();
        let cloud = b.get(path).copied();
        let local = cloud_files::read(root, path)?;
        evidence.push((
            path,
            old.map(|f| (&f.sha256, f.executable)),
            cloud.map(|f| (&f.sha256, f.executable)),
            local.as_ref().map(|f| (f.sha256.clone(), f.executable)),
        ));
        if same(old, cloud) || same(local.as_ref(), cloud) {
            continue;
        }
        if same(local.as_ref(), old) {
            changes.push(path.clone());
        } else {
            conflicts.push(path.clone());
        }
    }
    let digest = cloud_files::hash(&serde_json::to_vec(&evidence).map_err(|e| e.to_string())?);
    Ok(Review {
        changes,
        conflicts,
        digest,
    })
}
fn same(a: Option<&CloudFile>, b: Option<&CloudFile>) -> bool {
    match (a, b) {
        (None, None) => true,
        (Some(a), Some(b)) => a.sha256 == b.sha256 && a.executable == b.executable,
        _ => false,
    }
}
pub fn apply(
    root: &Path,
    base: &[CloudFile],
    current: &[CloudFile],
    digest: &str,
    backup: &Path,
) -> Result<serde_json::Value, String> {
    let plan = review(root, base, current)?;
    if plan.digest != digest {
        return Err("Local or cloud files changed. Review again before applying.".into());
    }
    fs::create_dir_all(backup).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(backup, fs::Permissions::from_mode(0o700))
            .map_err(|e| e.to_string())?;
    }
    let mut originals = vec![];
    for p in &plan.changes {
        if let Some(f) = cloud_files::read(root, p)? {
            originals.push(f);
        }
    }
    let recovery =
        serde_json::json!({ "version": 1, "root": root, "review": plan, "originals": originals });
    fs::write(
        backup.join("recovery.json"),
        serde_json::to_vec(&recovery).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    let incoming = backup.join("incoming");
    fs::create_dir(&incoming).map_err(|e| e.to_string())?;
    for f in current {
        cloud_files::write(&incoming, f)?;
    }
    // Recheck the complete tree after backing up and before the first mutation.
    if review(root, base, current)?.digest != digest {
        return Err("Files changed during backup. Review again.".into());
    }
    let mut applied = vec![];
    for p in &plan.changes {
        let result = if let Some(f) = current.iter().find(|f| &f.path == p) {
            cloud_files::write(root, f)
        } else {
            fs::remove_file(cloud_files::target(root, p)?).map_err(|e| e.to_string())
        };
        if let Err(e) = result {
            return Err(format!(
                "Apply stopped: {e}. Completed {} files. Backup: {}",
                applied.len(),
                backup.display()
            ));
        }
        applied.push(p.clone());
    }
    Ok(serde_json::json!({ "applied": applied, "conflicts": plan.conflicts, "backup": backup }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::{engine::general_purpose::STANDARD, Engine};
    fn file(path: &str, content: &str) -> CloudFile {
        CloudFile {
            path: path.into(),
            content: STANDARD.encode(content),
            sha256: cloud_files::hash(content.as_bytes()),
            executable: false,
        }
    }
    #[test]
    fn three_way_preserves_local_changes_and_backs_up_deletions() {
        let root = tempfile::tempdir().unwrap();
        let backup = tempfile::tempdir().unwrap();
        let base = vec![file("a", "old"), file("b", "old"), file("c", "remove")];
        for f in &base {
            cloud_files::write(root.path(), f).unwrap();
        }
        cloud_files::write(root.path(), &file("b", "local")).unwrap();
        let cloud = vec![file("a", "cloud"), file("b", "cloud")];
        let review = review(root.path(), &base, &cloud).unwrap();
        assert_eq!(review.changes, vec!["a", "c"]);
        assert_eq!(review.conflicts, vec!["b"]);
        apply(root.path(), &base, &cloud, &review.digest, backup.path()).unwrap();
        assert_eq!(fs::read_to_string(root.path().join("a")).unwrap(), "cloud");
        assert_eq!(fs::read_to_string(root.path().join("b")).unwrap(), "local");
        assert!(!root.path().join("c").exists());
        assert!(backup.path().join("recovery.json").exists());
    }
    #[test]
    fn changed_local_state_invalidates_review() {
        let root = tempfile::tempdir().unwrap();
        let base = vec![file("a", "old")];
        cloud_files::write(root.path(), &base[0]).unwrap();
        let cloud = vec![file("a", "new")];
        let digest = review(root.path(), &base, &cloud).unwrap().digest;
        cloud_files::write(root.path(), &file("a", "edited")).unwrap();
        assert!(apply(root.path(), &base, &cloud, &digest, root.path()).is_err());
    }
}
