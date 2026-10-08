use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::Path,
};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct CloudFile {
    pub path: String,
    pub content: String,
    pub sha256: String,
    #[serde(default)]
    pub executable: bool,
}
pub fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
mod paths;
pub use paths::{relative, target};
pub fn validate(files: &[CloudFile]) -> Result<(), String> {
    let mut names = HashSet::new();
    let mut prefixes = HashMap::new();
    let mut total = 0;
    if files.len() > 2000 {
        return Err("Cloud transfer supports at most 2000 files.".into());
    }
    for f in files {
        relative(&f.path)?;
        let parts: Vec<_> = f.path.split('/').collect();
        for i in 1..=parts.len() {
            let original = parts[..i].join("/");
            if let Some(previous) = prefixes.insert(original.to_lowercase(), original.clone()) {
                if previous != original {
                    return Err("Directory names collide on the Mac.".into());
                }
            }
        }
        if !names.insert(f.path.to_lowercase()) {
            return Err("File names collide on the Mac.".into());
        }
        let bytes = STANDARD
            .decode(&f.content)
            .map_err(|_| "Invalid file encoding.")?;
        total += bytes.len();
        if bytes.len() > 1_048_576
            || total > 20_971_520
            || hash(&bytes) != f.sha256
            || STANDARD.encode(&bytes) != f.content
        {
            return Err("Project checksum or transfer quota failed.".into());
        }
    }
    for name in &names {
        let parts: Vec<_> = name.split('/').collect();
        for i in 1..parts.len() {
            if names.contains(&parts[..i].join("/")) {
                return Err("File and directory paths collide.".into());
            }
        }
    }
    Ok(())
}
pub fn read(root: &Path, name: &str) -> Result<Option<CloudFile>, String> {
    let p = target(root, name)?;
    let m = match fs::symlink_metadata(&p) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e.to_string()),
    };
    if !m.is_file() || m.len() > 1_048_576 {
        return Err("Cloud transfer supports ordinary files up to 1 MiB.".into());
    }
    let bytes = fs::read(&p).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    let executable = {
        use std::os::unix::fs::PermissionsExt;
        m.permissions().mode() & 0o111 != 0
    };
    #[cfg(not(unix))]
    let executable = false;
    Ok(Some(CloudFile {
        path: name.into(),
        content: STANDARD.encode(&bytes),
        sha256: hash(&bytes),
        executable,
    }))
}
pub fn write(root: &Path, file: &CloudFile) -> Result<(), String> {
    let p = target(root, &file.path)?;
    let parent = p.parent().ok_or("Missing parent.")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    target(root, &file.path)?;
    let bytes = STANDARD
        .decode(&file.content)
        .map_err(|_| "Invalid file encoding.")?;
    let mut tmp = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    use std::io::Write;
    tmp.write_all(&bytes).map_err(|e| e.to_string())?;
    tmp.as_file().sync_all().map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        tmp.as_file()
            .set_permissions(fs::Permissions::from_mode(if file.executable {
                0o755
            } else {
                0o644
            }))
            .map_err(|e| e.to_string())?;
    }
    tmp.persist(p).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn file(name: &str) -> CloudFile {
        CloudFile {
            path: name.into(),
            content: String::new(),
            sha256: hash(b""),
            executable: false,
        }
    }
    #[test]
    fn directory_case_and_credential_paths_are_refused() {
        assert!(validate(&[file("Source/a"), file("source/b")]).is_err());
        assert!(validate(&[file("source"), file("source/b")]).is_err());
        for name in [".npmrc", "x/.netrc", ".pypirc", ".cloud-control/file"] {
            assert!(relative(name).is_err());
        }
        assert!(validate(&[file("source/a"), file("source/b")]).is_ok());
    }
}
