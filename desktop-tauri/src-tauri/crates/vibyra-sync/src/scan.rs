//! A lightweight look inside a file that is about to be committed or synced (moved here from the desktop
//! `cloud_git/scan.rs`, which re-exports it).
//! Matches are
//! held back exactly like secret file names, with no override: a false alarm
//! stays out of the hand-off rather than risking a leaked key.
pub const MAX_SCAN_BYTES: u64 = 1024 * 1024;

fn token_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_' || c == '-'
}

/// Why `bytes` look like they hold a secret, or `None`.
pub fn content_reason(bytes: &[u8]) -> Option<&'static str> {
    let text = String::from_utf8_lossy(bytes);
    if let Some(at) = text.find("-----BEGIN ") {
        let line = text[at..].lines().next().unwrap_or("");
        if line.contains("PRIVATE KEY") {
            return Some("contains a private key");
        }
    }
    text.split(|c: char| !token_char(c))
        .find_map(token_reason)
        .map(|_| "contains what looks like an access token")
}

fn all(t: &str, f: impl Fn(char) -> bool) -> bool {
    t.chars().all(f)
}

fn token_reason(t: &str) -> Option<()> {
    let upper = |c: char| c.is_ascii_uppercase() || c.is_ascii_digit();
    let alnum = |c: char| c.is_ascii_alphanumeric();
    let hit = (t.len() == 20 && (t.starts_with("AKIA") || t.starts_with("ASIA")) && all(t, upper))
        || (t.len() >= 40
            && ["ghp_", "gho_", "ghu_", "ghs_", "ghr_"]
                .iter()
                .any(|p| t.starts_with(p))
            && all(&t[4..], alnum))
        || (t.len() >= 40 && t.starts_with("github_pat_"))
        || (t.len() >= 23 && t.starts_with("sk-") && all(&t[3..], token_char))
        || (t.len() >= 20 && (t.starts_with("sk_live_") || t.starts_with("rk_live_")))
        || (t.len() >= 15
            && t.starts_with("xox")
            && t[3..].starts_with(['b', 'a', 'p', 'r', 's'])
            && t[4..].starts_with('-'))
        || (t.len() == 39 && t.starts_with("AIza"));
    hit.then_some(())
}
