use std::collections::HashSet;
use std::path::Path;

use super::ActivityCounts;

const MAX_UNTRACKED_BYTES: u64 = 4 * 1024 * 1024;
const MAX_FILE_BYTES: u64 = 512 * 1024;

pub(super) fn count_untracked(
    root: &Path,
    raw: &[u8],
    counts: &mut ActivityCounts,
    paths: &mut HashSet<String>,
) -> bool {
    let mut budget = 0_u64;
    let mut truncated = false;
    for field in raw.split(|byte| *byte == 0).filter(|path| !path.is_empty()) {
        let relative = String::from_utf8_lossy(field).to_string();
        let path = root.join(&relative);
        let Ok(meta) = path.symlink_metadata() else {
            continue;
        };
        if !meta.is_file() {
            paths.insert(relative);
            continue;
        }
        paths.insert(relative);
        if meta.len() > MAX_FILE_BYTES || budget + meta.len() > MAX_UNTRACKED_BYTES {
            truncated = true;
            continue;
        }
        budget += meta.len();
        let Ok(bytes) = std::fs::read(&path) else {
            continue;
        };
        if bytes.iter().take(8_192).any(|byte| *byte == 0) {
            counts.binary_files += 1;
        } else if !bytes.is_empty() {
            let lines = bytes.iter().filter(|byte| **byte == b'\n').count() as u64;
            counts.additions = counts
                .additions
                .saturating_add(lines + u64::from(*bytes.last().unwrap_or(&b'\n') != b'\n'));
        }
    }
    truncated
}
