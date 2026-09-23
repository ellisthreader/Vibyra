use std::fs::File;
use std::io::Read;
use std::path::Path;
use vibyra_core::preview::PreviewTarget;

const MAX_SOURCE_BYTES: u64 = 1024 * 1024;

/// Include the exact launch manifests. The detected display command alone can
/// stay `npm run dev` after package.json changes its underlying script.
pub(super) fn capture(root: &Path, target: &PreviewTarget) -> Result<String, String> {
    let app = root
        .join(&target.relative_root)
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if !app.starts_with(root) || !app.is_dir() {
        return Err("Preview target moved outside its approved project".into());
    }
    let sources = ["package.json", "composer.json", "artisan"]
        .map(|name| read_source(&app.join(name)).map(|content| (name, content)))
        .into_iter()
        .collect::<Result<Vec<_>, _>>()?;
    serde_json::to_string(&(target, sources)).map_err(|e| e.to_string())
}

fn read_source(path: &Path) -> Result<Option<String>, String> {
    let file = match File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.to_string()),
    };
    if file.metadata().map_err(|e| e.to_string())?.len() > MAX_SOURCE_BYTES {
        return Err("Preview launch manifest is too large to approve".into());
    }
    let mut bytes = Vec::new();
    file.take(MAX_SOURCE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 > MAX_SOURCE_BYTES {
        return Err("Preview launch manifest is too large to approve".into());
    }
    String::from_utf8(bytes)
        .map(Some)
        .map_err(|_| "Preview launch manifest is not UTF-8".into())
}
