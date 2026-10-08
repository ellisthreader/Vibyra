use std::{
    fs,
    path::{Component, Path, PathBuf},
};

pub fn excluded(name: &str) -> bool {
    let n = name.to_lowercase();
    [
        ".git",
        ".ssh",
        ".aws",
        "node_modules",
        "vendor",
        ".expo",
        ".ds_store",
        ".vibyra-agent",
        ".cloud-control",
        ".npmrc",
        ".netrc",
        ".pypirc",
    ]
    .contains(&n.as_str())
        || n == ".env"
        || n.starts_with(".env.")
}
pub fn relative(name: &str) -> Result<(), String> {
    if name.is_empty()
        || name.len() > 1024
        || name.contains('\\')
        || name.chars().any(|c| c.is_control())
        || name
            .split('/')
            .any(|p| p.is_empty() || p == "." || p == ".." || excluded(p))
        || Path::new(name)
            .components()
            .any(|p| !matches!(p, Component::Normal(_)))
    {
        return Err("Unsafe or excluded project path.".into());
    }
    Ok(())
}
pub fn target(root: &Path, name: &str) -> Result<PathBuf, String> {
    relative(name)?;
    let mut at = root.to_path_buf();
    for part in name.split('/') {
        at.push(part);
        match fs::symlink_metadata(&at) {
            Ok(m) if m.file_type().is_symlink() => {
                return Err("Symlinks are not supported for cloud transfer.".into())
            }
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.to_string()),
        }
    }
    Ok(at)
}
