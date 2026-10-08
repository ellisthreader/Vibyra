//! The sign-in link a provider CLI prints.

/// The first sign-in link in `text`, or `None` while one is still arriving.
///
/// A provider prints an OAuth URL hundreds of characters long, and a pipe hands
/// it over in whatever chunks it likes. A link only counts once something
/// terminates it, or once the stream ends and nothing more is coming.
pub(super) fn find_https_url(text: &str, at_eof: bool) -> Option<String> {
    let start = text.find("https://")?;
    let rest = &text[start..];
    let end = rest.find(|character: char| {
        character.is_whitespace()
            || character.is_control()
            || matches!(character, '"' | '\'' | '<' | '>' | '(' | ')')
    });
    let candidate = match end {
        Some(end) => &rest[..end],
        None if at_eof => rest,
        None => return None,
    };
    let candidate = candidate.trim_end_matches([',', '.', ';', ':', ']', '}']);
    (candidate.len() > "https://".len()).then(|| candidate.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_provider_url_without_terminal_punctuation() {
        assert_eq!(
            find_https_url("Open https://auth.example.test/login?code=abc).\n", false),
            Some("https://auth.example.test/login?code=abc".into())
        );
    }

    #[test]
    fn half_written_url_is_not_a_link_yet() {
        let partial = "visit: https://auth.example.test/login?code=abc";
        assert_eq!(find_https_url(partial, false), None);
        assert_eq!(
            find_https_url(partial, true),
            Some("https://auth.example.test/login?code=abc".into())
        );
    }
}
