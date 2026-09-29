//! The one-time code Codex prints for browser authorization on another device.
pub fn from_output(output: &str) -> String {
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
            && (4..=5).contains(&parts[0].len())
            && (4..=5).contains(&parts[1].len())
            && parts.iter().all(|part| {
                part.chars()
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
