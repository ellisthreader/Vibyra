use std::collections::HashSet;

/// Explicit platform input keeps drive-letter and delimiter rules tested everywhere.
pub(super) fn merge_for(
    windows: bool,
    current: &str,
    discovered: &str,
    extras: &[String],
) -> String {
    let mut seen = HashSet::new();
    let mut merged = Vec::new();
    for entry in entries(windows, discovered)
        .into_iter()
        .chain(entries(windows, current))
        .chain(extras.iter().cloned())
    {
        let entry = normalize(windows, &entry);
        let identity = if windows {
            entry.to_ascii_lowercase()
        } else {
            entry.clone()
        };
        if !entry.is_empty() && seen.insert(identity) {
            merged.push(if windows && entry.contains(';') {
                format!("\"{entry}\"")
            } else {
                entry
            });
        }
    }
    merged.join(if windows { ";" } else { ":" })
}

/// Windows PATH quoting groups semicolons inside one directory, as split_paths does.
pub(super) fn entries(windows: bool, value: &str) -> Vec<String> {
    if !windows {
        return value.split(':').map(str::to_owned).collect();
    }
    let mut entries = Vec::new();
    let mut entry = String::new();
    let mut quoted = false;
    for character in value.chars() {
        match character {
            '"' => quoted = !quoted,
            ';' if !quoted => entries.push(std::mem::take(&mut entry)),
            _ => entry.push(character),
        }
    }
    entries.push(entry);
    entries
}

pub(super) fn normalize(windows: bool, entry: &str) -> String {
    // C:\ is an absolute drive root; C: is relative to that drive's current folder.
    let drive_root = windows
        && entry.len() == 3
        && entry.as_bytes()[0].is_ascii_alphabetic()
        && entry.as_bytes()[1] == b':'
        && matches!(entry.as_bytes()[2], b'/' | b'\\');
    let trimmed = entry.trim_end_matches(|c| c == '/' || (windows && c == '\\'));
    if drive_root || trimmed.is_empty() {
        entry.to_owned()
    } else {
        trimmed.to_owned()
    }
}
