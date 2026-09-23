//! Keep released Mac wording while giving Linux the correct computer label.
pub const fn for_computer(mac: &'static str, other: &'static str) -> &'static str {
    if cfg!(target_os = "macos") {
        mac
    } else {
        other
    }
}
