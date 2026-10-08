//! Finds and masks common secrets in text that is about to reach a model, a
//! notification or an export (roadmap Part 16). Pure functions, no I/O, and the
//! same behaviour as `SecretGuard.php` on the backend; the shared corpus
//! `docs/secret-guard-vectors.json` holds both to it, false positives
//! included. A redaction reads `[redacted:<kind>]` and never keeps any part of
//! the secret.

pub mod allow;
mod paths;
mod patterns;
mod scan;
mod values;

#[cfg(test)]
mod tests;
#[cfg(test)]
mod tests_allow;

pub use paths::sensitive_path;
pub use scan::MAX_BYTES;

use serde_json::Value;

/// The kinds found, first occurrence first.
pub fn scan(text: &str) -> Vec<String> {
    let mut kinds = Vec::new();
    scan::run(text, &mut kinds);
    unique(kinds)
}

pub fn redact(text: &str) -> String {
    scan::run(text, &mut Vec::new())
}

pub fn contains(text: &str) -> bool {
    !scan(text).is_empty()
}

/// Strings are redacted; a secret-named key keeps its name and loses its
/// value; everything else passes through.
pub fn redact_value(value: Value) -> Value {
    match value {
        Value::String(text) => Value::String(redact(&text)),
        Value::Array(items) => Value::Array(items.into_iter().map(redact_value).collect()),
        Value::Object(map) => Value::Object(
            map.into_iter()
                .map(|(key, item)| {
                    let item = match &item {
                        Value::String(text) if secret_key(&key, text) => {
                            Value::String("[redacted:secret_assignment]".to_owned())
                        }
                        _ => redact_value(item),
                    };
                    (key, item)
                })
                .collect(),
        ),
        other => other,
    }
}

pub fn kinds_in(value: &Value) -> Vec<String> {
    let mut kinds = Vec::new();
    collect(value, &mut kinds);
    unique(kinds)
}

fn collect(value: &Value, kinds: &mut Vec<String>) {
    match value {
        Value::String(text) => kinds.extend(scan(text)),
        Value::Array(items) => items.iter().for_each(|item| collect(item, kinds)),
        Value::Object(map) => {
            for (key, item) in map {
                match item {
                    Value::String(text) if secret_key(key, text) => {
                        kinds.push("secret_assignment".to_owned())
                    }
                    _ => collect(item, kinds),
                }
            }
        }
        _ => {}
    }
}

fn secret_key(key: &str, value: &str) -> bool {
    values::name_class(key) == Some(values::NameClass::Strong)
        && value.len() >= 8
        && !values::placeholder(value.as_bytes())
}

fn unique(kinds: Vec<String>) -> Vec<String> {
    let mut seen = Vec::new();
    for kind in kinds {
        if !seen.contains(&kind) {
            seen.push(kind);
        }
    }
    seen
}
