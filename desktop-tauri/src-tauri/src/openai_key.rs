// Validation for a user-supplied OpenAI API key. Format is checked locally so
// an obvious typo never becomes a network round trip, then the key is proved
// against OpenAI before it is stored — saving a key that does not work would
// leave the user debugging a silent failure at F8 time instead.

const MIN_LEN: usize = 20;
const MAX_LEN: usize = 400;

/// The public page where a key is created. Shown in the UI and opened by the
/// "Get a key" button.
pub const KEY_PAGE_URL: &str = "https://platform.openai.com/api-keys";

pub fn validate(raw: &str) -> Result<String, String> {
    let key = raw.trim();
    if key.is_empty() {
        return Err("Paste your OpenAI API key first.".into());
    }
    if !key.starts_with("sk-") {
        return Err("That does not look like an OpenAI key — they start with \"sk-\".".into());
    }
    if key.len() < MIN_LEN || key.len() > MAX_LEN {
        return Err("That key looks incomplete. Copy the whole value from OpenAI.".into());
    }
    if !key.chars().all(|c| c.is_ascii_graphic()) {
        return Err("That key contains spaces or line breaks. Copy it again.".into());
    }
    Ok(key.to_owned())
}

/// A safe-to-display fragment. Never the whole key: the settings pane shows
/// this so a user can tell *which* key is installed without it being readable
/// over a shoulder or in a screen share.
pub fn hint(key: &str) -> String {
    let tail: String = key
        .chars()
        .rev()
        .take(4)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    format!("sk-…{tail}")
}

/// Proves the key works, using the free `/v1/models` endpoint so validation
/// itself never costs the user anything.
pub async fn verify(key: &str) -> Result<(), String> {
    let response = reqwest::Client::new()
        .get("https://api.openai.com/v1/models")
        .bearer_auth(key)
        .timeout(std::time::Duration::from_secs(20))
        .send()
        .await
        .map_err(|error| format!("Could not reach OpenAI to check the key: {error}"))?;

    match response.status().as_u16() {
        200..=299 => Ok(()),
        401 | 403 => Err(
            "OpenAI rejected that key. Check it was copied in full and has not been revoked."
                .into(),
        ),
        429 => Err("OpenAI is rate limiting this key. Wait a moment and try again.".into()),
        status => Err(format!(
            "OpenAI returned HTTP {status} when checking the key."
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_values_that_are_not_openai_keys() {
        assert!(validate("   ").is_err());
        assert!(validate("hunter2").is_err());
        assert!(validate("sk-short").is_err());
        assert!(validate(&format!("sk-{}", "x".repeat(MAX_LEN))).is_err());
    }

    #[test]
    fn rejects_a_key_with_embedded_whitespace() {
        assert!(validate("sk-abcdefghij klmnopqrstuvwxyz").is_err());
        assert!(validate("sk-abcdefghij\nklmnopqrstuvwxyz").is_err());
    }

    #[test]
    fn accepts_and_trims_a_well_formed_key() {
        let key = format!("sk-proj-{}", "a".repeat(40));
        assert_eq!(validate(&format!("  {key}\n")).unwrap(), key);
    }

    #[test]
    fn hint_reveals_only_the_last_four_characters() {
        let key = format!("sk-proj-{}wxyz", "a".repeat(40));
        let hint = hint(&key);
        assert_eq!(hint, "sk-…wxyz");
        assert!(!hint.contains(&"a".repeat(5)));
    }
}
