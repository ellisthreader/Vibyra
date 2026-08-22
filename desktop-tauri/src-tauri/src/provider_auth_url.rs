use std::process::{Command, Stdio};

pub fn open(url: &str) -> Result<(), String> {
    if !url.starts_with("https://") || url.len() > 4_096 || url.chars().any(char::is_control) {
        return Err("The provider sign-in link is unavailable.".into());
    }
    let mut command = browser_command(url);
    command.stdout(Stdio::null()).stderr(Stdio::null());
    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Could not open the provider sign-in page: {error}"))
}

/// The first sign-in link in `text`, or `None` while one is still arriving.
///
/// A provider prints an OAuth URL hundreds of characters long, and a pipe
/// hands it over in whatever chunks it feels like. Returning as soon as
/// `https://` appears would hand the UI a URL cut off at a read boundary, so a
/// link only counts once something terminates it — or once the stream ends and
/// nothing more is coming.
pub fn find_https_url(text: &str, at_eof: bool) -> Option<String> {
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

#[cfg(target_os = "linux")]
fn browser_command(url: &str) -> Command {
    let mut command = Command::new("xdg-open");
    command.arg(url);
    command
}

#[cfg(target_os = "macos")]
fn browser_command(url: &str) -> Command {
    let mut command = Command::new("open");
    command.arg(url);
    command
}

#[cfg(target_os = "windows")]
fn browser_command(url: &str) -> Command {
    let mut command = Command::new("rundll32");
    command.args(["url.dll,FileProtocolHandler", url]);
    command
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
