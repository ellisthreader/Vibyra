use std::fs::File;
use std::io::Read;
use std::path::Path;

use crate::{CoreError, CoreResult};

const MAX_MANIFEST_BYTES: u64 = 1024 * 1024;

pub(crate) fn read_manifest(path: &Path, label: &str) -> CoreResult<Option<String>> {
    if !path.is_file() {
        return Ok(None);
    }
    let file = File::open(path)?;
    if file.metadata()?.len() > MAX_MANIFEST_BYTES {
        return Err(too_large(label));
    }
    let mut bytes = Vec::new();
    let mut limited = file.take(MAX_MANIFEST_BYTES + 1);
    limited.read_to_end(&mut bytes)?;
    if bytes.len() as u64 > MAX_MANIFEST_BYTES {
        return Err(too_large(label));
    }
    String::from_utf8(bytes)
        .map(Some)
        .map_err(|_| CoreError::Preview(format!("{label} is not valid UTF-8")))
}

fn too_large(label: &str) -> CoreError {
    CoreError::Preview(format!("{label} is too large to inspect safely"))
}

#[cfg(test)]
mod tests {
    use std::fs;

    use tempfile::tempdir;

    use super::{read_manifest, MAX_MANIFEST_BYTES};

    #[test]
    fn rejects_a_manifest_before_reading_past_the_limit() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("package.json");
        let file = fs::File::create(&path).unwrap();
        file.set_len(MAX_MANIFEST_BYTES + 1).unwrap();

        let error = read_manifest(&path, "package.json").unwrap_err();
        assert!(error.to_string().contains("too large"));
    }
}
