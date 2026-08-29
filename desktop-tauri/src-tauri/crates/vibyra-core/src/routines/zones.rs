//! Which timezone a routine is written in.
//!
//! Stored per routine rather than read at each tick, because a laptop that
//! travels must not silently move the user's 09:00 standup to 09:00 somewhere
//! else.

use chrono_tz::Tz;

/// Reads the machine's own timezone name, falling back to UTC.
///
/// Stored per routine rather than read at each tick: a laptop that travels
/// must not silently move the user's 09:00 standup to 09:00 somewhere else.
pub fn local_zone() -> Tz {
    iana_time_zone_name()
        .and_then(|name| name.parse().ok())
        .unwrap_or(chrono_tz::UTC)
}

/// The IANA name, read from the places Unix keeps it.
///
/// Deliberately not a dependency: this is two files and an environment
/// variable, and a crate for it would be a supply-chain surface for something
/// a dozen lines can answer. Windows has no such file and falls back to UTC,
/// where the user picks a zone explicitly instead.
fn iana_time_zone_name() -> Option<String> {
    if let Ok(name) = std::env::var("TZ") {
        let trimmed = name.trim_start_matches(':').trim();
        if !trimmed.is_empty() && trimmed.contains('/') {
            return Some(trimmed.to_string());
        }
    }
    if let Ok(link) = std::fs::read_link("/etc/localtime") {
        let text = link.to_string_lossy();
        if let Some(index) = text.find("zoneinfo/") {
            return Some(text[index + "zoneinfo/".len()..].to_string());
        }
    }
    std::fs::read_to_string("/etc/timezone")
        .ok()
        .map(|name| name.trim().to_string())
        .filter(|name| name.contains('/'))
}

/// Zones offered in the picker: the machine's own first, then the common ones.
pub fn offered_zones() -> Vec<String> {
    let mut zones = vec![local_zone().name().to_string()];
    for name in [
        "UTC",
        "Europe/London",
        "Europe/Berlin",
        "Europe/Madrid",
        "America/New_York",
        "America/Chicago",
        "America/Denver",
        "America/Los_Angeles",
        "America/Sao_Paulo",
        "Asia/Dubai",
        "Asia/Kolkata",
        "Asia/Singapore",
        "Asia/Tokyo",
        "Australia/Sydney",
    ] {
        if !zones.iter().any(|existing| existing == name) {
            zones.push(name.to_string());
        }
    }
    zones
}
