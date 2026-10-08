const TOKEN_PREFIX: &str = "sk-ant-oat01-";
/// The first complete `sk-ant-oat01-…` token in terminal output, with escape sequences taken out first.
pub fn find_token(raw: &[u8]) -> Option<String> {
    let text = strip_escapes(&String::from_utf8_lossy(raw));
    let start = text.find(TOKEN_PREFIX)?;
    let token: String = text[start..]
        .chars()
        .take_while(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    // A token still arriving ends at the edge of what was read; wait for the line to finish.
    let rest = &text[start + token.len()..];
    (token.len() >= TOKEN_PREFIX.len() + 40 && !rest.is_empty()).then_some(token)
}

fn strip_escapes(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        if c != '\u{1b}' {
            out.push(c);
            continue;
        }
        match chars.next() {
            Some('[') => {
                for c in chars.by_ref() {
                    if ('@'..='~').contains(&c) {
                        break;
                    }
                }
            }
            Some(']') => {
                while let Some(c) = chars.next() {
                    if c == '\u{7}' {
                        break;
                    }
                    if c == '\u{1b}' {
                        chars.next();
                        break;
                    }
                }
            }
            _ => {}
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_token_is_read_whole_through_escape_codes_and_never_half_way() {
        let token = format!("{TOKEN_PREFIX}{}", "Ab9_-".repeat(20));
        let printed = format!("\u{1b}[32m✓ Done\u{1b}[0m\r\nYour OAuth token (valid for 1 year):\r\n\u{1b}[1m{token}\u{1b}[22m\r\nStore it safely");
        assert_eq!(find_token(printed.as_bytes()), Some(token.clone()));
        assert_eq!(
            find_token(&printed.as_bytes()[..printed.find(&token).unwrap() + 30]),
            None
        );
        assert_eq!(find_token(b"Paste code here if prompted >"), None);
        assert_eq!(
            find_token(format!("{TOKEN_PREFIX}short\n").as_bytes()),
            None
        );
    }
}
