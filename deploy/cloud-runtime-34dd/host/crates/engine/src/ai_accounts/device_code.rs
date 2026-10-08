//! The one-time code Codex prints for browser authorization on another device.

/// Only that bounded token, never the surrounding CLI output.
pub(super) fn from_output(output: &str) -> String {
    let clean = strip_ansi(output);
    let mut after_step = false;
    for line in clean.lines().map(str::trim) {
        if line.starts_with("2.") && line.to_ascii_lowercase().contains("code") {
            after_step = true;
            continue;
        }
        if !after_step || line.is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.split('-').collect();
        if parts.len() == 2
            && parts.iter().all(|part| {
                (4..=5).contains(&part.len())
                    && part
                        .chars()
                        .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit())
            })
        {
            return line.to_owned();
        }
        break;
    }
    String::new()
}

fn strip_ansi(input: &str) -> String {
    let mut clean = String::with_capacity(input.len());
    let mut escape = false;
    for character in input.chars() {
        if character == '\x1b' {
            escape = true;
            continue;
        }
        if escape {
            if character == 'm' {
                escape = false;
            }
            continue;
        }
        clean.push(character);
    }
    clean
}

#[cfg(test)]
mod tests {
    use super::from_output;

    #[test]
    fn the_code_is_read_without_terminal_escapes() {
        let said = "1. Open this link\n  https://auth.openai.com/codex/device\n\n\
            2. Enter this one-time code (expires in 15 minutes)\n  \x1b[94mABCD-EFGHJ\x1b[0m\n";
        assert_eq!(from_output(said), "ABCD-EFGHJ");
        assert_eq!(from_output("Paste code here if prompted > "), "");
        assert_eq!(from_output("2. Enter this code\n  not a code line\n"), "");
    }
}
