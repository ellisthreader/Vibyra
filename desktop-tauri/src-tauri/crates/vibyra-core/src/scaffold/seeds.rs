use super::ScaffoldSeed;
use crate::{CoreError, CoreResult};
use std::{
    fs,
    io::Write,
    path::{Component, Path},
};

pub(super) fn validate(seeds: &[ScaffoldSeed]) -> CoreResult<()> {
    let mut paths = std::collections::HashSet::new();
    for seed in seeds {
        let path = Path::new(&seed.path);
        if seed.path.is_empty()
            || !path.components().all(|c| matches!(c, Component::Normal(_)))
            || !paths.insert(path)
        {
            return Err(CoreError::InvalidPath(format!(
                "{} is not a unique path inside the project",
                seed.path
            )));
        }
    }
    Ok(())
}

pub(super) fn write(dir: &Path, seeds: &[ScaffoldSeed]) -> CoreResult<()> {
    validate(seeds)?;
    for seed in seeds {
        let target = dir.join(&seed.path);
        let mut current = dir.to_path_buf();
        for part in Path::new(&seed.path)
            .parent()
            .into_iter()
            .flat_map(Path::components)
        {
            current.push(part);
            match fs::symlink_metadata(&current) {
                Ok(meta) if meta.is_dir() && !meta.file_type().is_symlink() => {}
                Ok(_) => {
                    return Err(CoreError::InvalidPath(
                        "A seed folder is not a regular directory.".into(),
                    ))
                }
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                    fs::create_dir(&current)?
                }
                Err(error) => return Err(error.into()),
            }
        }
        // A creator's files and earlier additions are never overwritten.
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(target)?;
        file.write_all(seed.body.as_bytes())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scaffold::{apply_seeds, prepare, ScaffoldPlan};
    #[test]
    fn creator_runs_before_addons_and_existing_files_are_preserved() {
        let root = tempfile::tempdir().unwrap();
        let dir = root.path().join("app");
        let plan = ScaffoldPlan {
            dir: dir.to_string_lossy().into(),
            create_dir: false,
            seeds: vec![ScaffoldSeed {
                path: "services/express/package.json".into(),
                body: "addon".into(),
            }],
            steps: vec![],
            git_init: false,
        };
        prepare(&plan).unwrap();
        assert!(
            !dir.exists(),
            "the creator must see no prewritten addon files"
        );
        assert!(
            apply_seeds(&plan).is_err(),
            "successful exit alone does not prove creation"
        );
        fs::create_dir(&dir).unwrap();
        fs::write(dir.join("package.json"), "base").unwrap();
        apply_seeds(&plan).unwrap();
        assert_eq!(
            fs::read_to_string(dir.join("package.json")).unwrap(),
            "base"
        );
        assert_eq!(
            fs::read_to_string(dir.join("services/express/package.json")).unwrap(),
            "addon"
        );
        assert!(
            apply_seeds(&plan).is_err(),
            "a retry cannot overwrite an existing seed"
        );
    }
    #[test]
    fn invalid_or_duplicate_seeds_fail_before_any_file_is_written() {
        let root = tempfile::tempdir().unwrap();
        let valid = ScaffoldSeed {
            path: "safe.txt".into(),
            body: "new".into(),
        };
        let invalid = ScaffoldSeed {
            path: "../escape.txt".into(),
            body: "bad".into(),
        };
        assert!(write(root.path(), &[valid.clone(), invalid]).is_err());
        assert!(write(root.path(), &[valid.clone(), valid]).is_err());
        assert_eq!(fs::read_dir(root.path()).unwrap().count(), 0);
    }
    #[cfg(unix)]
    #[test]
    fn seed_parent_symlink_cannot_escape_to_an_existing_folder() {
        let root = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        std::os::unix::fs::symlink(outside.path(), root.path().join("services")).unwrap();
        assert!(write(
            root.path(),
            &[ScaffoldSeed {
                path: "services/new/file.txt".into(),
                body: "bad".into()
            }]
        )
        .is_err());
        assert_eq!(fs::read_dir(outside.path()).unwrap().count(), 0);
    }
}
