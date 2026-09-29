//! Where a text field is, as window fractions, and which phone keyboard suits it.

use super::backend::Geometry;

/// `rect` as fractions of the window, clipped to it; None when none of it shows.
pub(crate) fn fraction(rect: [f64; 4], window: &Geometry) -> Option<[f64; 4]> {
    let [x, y, width, height] = rect;
    let left = x.max(window.x);
    let top = y.max(window.y);
    let right = (x + width).min(window.x + window.width);
    let bottom = (y + height).min(window.y + window.height);
    if right - left < 1.0 || bottom - top < 1.0 || window.width <= 0.0 || window.height <= 0.0 {
        return None;
    }
    let round = |value: f64| (value * 10_000.0).round() / 10_000.0;
    Some([
        round((left - window.x) / window.width),
        round((top - window.y) / window.height),
        round((right - left) / window.width),
        round((bottom - top) / window.height),
    ])
}

/// The phone keyboard that suits a field. Structure wins over wording: a
/// password or multi-line field never gets an email keyboard.
pub(crate) fn kind(secure: bool, multiline: bool, search: bool, hints: &str) -> &'static str {
    let words = hints.to_lowercase();
    let has = |any: &[&str]| any.iter().any(|word| words.contains(word));
    if secure {
        "secure"
    } else if search {
        "search"
    } else if multiline {
        "multiline"
    } else if has(&["email", "e-mail"]) {
        "email"
    } else if has(&["url", "website", "web address"]) {
        "url"
    } else if has(&["phone", "telephone", "mobile number"]) {
        "tel"
    } else if has(&[
        "one-time code",
        "verification code",
        "otp",
        "pin code",
        "passcode",
    ]) {
        "number"
    } else if has(&["search"]) {
        "search"
    } else {
        "text"
    }
}
