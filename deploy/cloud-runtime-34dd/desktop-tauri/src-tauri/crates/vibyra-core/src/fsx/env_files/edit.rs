//! Changing one key in the text of an env file: set (replace the last
//! occurrence or append) and delete (every occurrence). Pure text in, text out.

use super::parse::{content, encode, parse, split_lines, valid_key, Parsed, Quote};

pub const MAX_VALUE: usize = 8 * 1024;

pub fn check_value(value: &str) -> Result<(), String> {
    if value.len() > MAX_VALUE {
        return Err("That value is too long (8 KB at most).".into());
    }
    if value.contains('\0') {
        return Err("A value cannot contain a null character.".into());
    }
    Ok(())
}

fn terminator(line: &str) -> &str {
    &line[content(line).len()..]
}

/// The file's own line ending, for lines that did not have one.
fn eol(text: &str) -> &'static str {
    if text.contains("\r\n") {
        "\r\n"
    } else {
        "\n"
    }
}

fn render(entry: &Parsed, value: &str) -> String {
    let export = if entry.exported { "export " } else { "" };
    format!(
        "{}{export}{}={}{}",
        entry.indent,
        entry.key,
        encode(value, entry.quote),
        entry.suffix
    )
}

pub fn set(text: &str, key: &str, value: &str) -> Result<String, String> {
    if !valid_key(key) {
        return Err(
            "Keys use letters, digits, underscores and dots, and do not start with a digit.".into(),
        );
    }
    check_value(value)?;
    let lines = split_lines(text);
    let entries = parse(&lines);
    let Some(entry) = entries.iter().rev().find(|e| e.key == key) else {
        let mut out = text.to_owned();
        let ending = eol(text);
        if !out.is_empty() && !out.ends_with('\n') {
            out.push_str(ending);
        }
        let fresh = Parsed {
            key: key.into(),
            value: String::new(),
            quote: Quote::None,
            exported: false,
            indent: String::new(),
            suffix: String::new(),
            first: 0,
            last: 0,
        };
        out.push_str(&render(&fresh, value));
        out.push_str(ending);
        return Ok(out);
    };
    let replacement = render(entry, value) + terminator(lines[entry.last]);
    let mut out = String::with_capacity(text.len() + value.len());
    for (index, line) in lines.iter().enumerate() {
        if index == entry.first {
            out.push_str(&replacement);
        } else if index < entry.first || index > entry.last {
            out.push_str(line);
        }
    }
    Ok(out)
}

/// Removes every line of every occurrence of `key`. `None` when it is absent.
pub fn delete(text: &str, key: &str) -> Option<String> {
    let lines = split_lines(text);
    let spans: Vec<_> = parse(&lines).into_iter().filter(|e| e.key == key).collect();
    if spans.is_empty() {
        return None;
    }
    Some(
        lines
            .iter()
            .enumerate()
            .filter(|(i, _)| !spans.iter().any(|e| (e.first..=e.last).contains(i)))
            .map(|(_, line)| *line)
            .collect(),
    )
}

#[cfg(test)]
#[path = "edit_tests.rs"]
mod tests;
