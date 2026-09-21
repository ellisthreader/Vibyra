use std::path::Path;

use crate::{CoreError, CoreResult};

/// Creates exactly one new directory; existing folders are never adopted here.
pub fn create_project_folder(parent: &str, name: &str) -> CoreResult<String> {
    let name = name.trim();
    if name.is_empty()
        || matches!(name, "." | "..")
        || name
            .chars()
            .any(|c| c.is_control() || matches!(c, '/' | '\\' | ':'))
    {
        return Err(CoreError::InvalidPath("Enter a valid folder name".into()));
    }
    let parent = Path::new(parent).canonicalize()?;
    if !parent.is_dir() {
        return Err(CoreError::InvalidPath("Choose a parent folder".into()));
    }
    let path = parent.join(name);
    std::fs::create_dir(&path)?;
    Ok(path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_only_a_new_child_and_preserves_existing_content() {
        let temp = tempfile::tempdir().unwrap();
        let parent = temp.path().to_str().unwrap();
        let path = create_project_folder(parent, "My project").unwrap();
        assert!(Path::new(&path).is_dir());
        std::fs::write(Path::new(&path).join("keep.txt"), "keep").unwrap();
        assert!(create_project_folder(parent, "My project").is_err());
        assert_eq!(
            std::fs::read_to_string(Path::new(&path).join("keep.txt")).unwrap(),
            "keep"
        );
        for name in [
            "",
            ".",
            "..",
            "../escape",
            "nested/folder",
            "nested\\folder",
            "bad:name",
        ] {
            assert!(create_project_folder(parent, name).is_err(), "{name}");
        }
        assert!(create_project_folder(&format!("{parent}/missing"), "child").is_err());
    }
}
