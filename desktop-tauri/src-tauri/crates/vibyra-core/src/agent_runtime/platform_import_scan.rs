//! Reading a source file the way two different compilers will.
//!
//! Text analysis, not a parser: it splits a file into what every platform
//! compiles and what only one does, then asks whether a name appears in each.
//! Deliberately conservative — an unrecognised `cfg` counts as ungated,
//! because inventing an offence is how a test earns its deletion.
//!
//! Used by `platform_import_tests`, which says why any of this exists.

use std::collections::BTreeSet;

/// Which platform exclusively uses `name`, or `None` when it is safe.
///
/// Safe means any of three things, and each rules out a false positive that
/// the first draft of this tripped on:
///
/// * used outside every `cfg` — the ordinary case;
/// * used by **both** platforms' branches, so both compilations need it
///   (`Command` in `process_kill.rs`);
/// * not named anywhere at all, which is a trait imported for its methods
///   (`std::io::Write`). Clippy judges those identically on every platform, so
///   they are not this bug.
pub(super) fn used_by_one_platform_only(source: &str, name: &str) -> Option<&'static str> {
    let (ungated, unix, other) = partition(source);
    if mentions(&ungated, name) {
        return None;
    }
    match (mentions(&unix, name), mentions(&other, name)) {
        (true, false) => Some("unix-only"),
        (false, true) => Some("non-unix-only"),
        _ => None,
    }
}

/// The identifiers a file's module-scope `use` statements bring into scope.
///
/// Module scope means "not indented" — a `use` inside a function is exactly
/// the shape this is asking for, so it is not collected. Nor is one that
/// already carries its own `cfg`.
pub(super) fn module_scope_imports(source: &str) -> BTreeSet<String> {
    let mut found = BTreeSet::new();
    let mut gated = false;
    for line in source.lines() {
        if line.starts_with("#[cfg(") {
            gated = true;
            continue;
        }
        if !line.starts_with("use ") {
            gated = false;
            continue;
        }
        if !gated {
            found.extend(leaf_names(line));
        }
        gated = false;
    }
    found
}

/// Splits a file into the text every platform compiles, the text only unix
/// compiles, and the text only the others do.
fn partition(source: &str) -> (String, String, String) {
    let (mut ungated, mut unix, mut other) = (String::new(), String::new(), String::new());
    let mut lines = source.lines().peekable();
    while let Some(line) = lines.next() {
        let Some(gate) = line.strip_prefix("#[cfg(") else {
            ungated.push_str(line);
            ungated.push('\n');
            continue;
        };
        let bucket = if gate.starts_with("not(unix)") || gate.contains("windows") {
            &mut other
        } else if gate.starts_with("unix") || gate.contains("target_os") {
            &mut unix
        } else {
            &mut ungated
        };
        for body in take_item(&mut lines) {
            bucket.push_str(&body);
            bucket.push('\n');
        }
    }
    (ungated, unix, other)
}

/// The lines of the item an attribute introduces: any further attributes, its
/// signature, and its body to the closing brace at column zero.
fn take_item<'a>(lines: &mut std::iter::Peekable<impl Iterator<Item = &'a str>>) -> Vec<String> {
    let mut item = Vec::new();
    while lines.peek().is_some_and(|next| next.starts_with('#')) {
        item.push(lines.next().unwrap_or_default().to_string());
    }
    let Some(head) = lines.next() else {
        return item;
    };
    item.push(head.to_string());
    if head.ends_with(';') || !head.contains('{') {
        return item;
    }
    for body in lines.by_ref() {
        item.push(body.to_string());
        if body == "}" {
            break;
        }
    }
    item
}

/// The names a `use` line binds: the tail of each path, minus any alias.
fn leaf_names(line: &str) -> Vec<String> {
    let body = line
        .trim_start_matches("use ")
        .trim_end_matches(';')
        .replace(['{', '}'], " ");
    body.split(',')
        .filter_map(|part| {
            let path = part.trim();
            if path.is_empty() || path == "self" || path.ends_with('*') {
                return None;
            }
            let leaf = path.rsplit("::").next()?.trim();
            let name = leaf.rsplit(" as ").next()?.trim();
            (!name.is_empty() && name != "self").then(|| name.to_string())
        })
        .collect()
}

/// Whether `name` is used in `source` outside of its own import lines.
fn mentions(source: &str, name: &str) -> bool {
    source
        .lines()
        .filter(|line| !line.trim_start().starts_with("use "))
        .any(|line| {
            line.match_indices(name).any(|(at, _)| {
                let before = line[..at].chars().next_back();
                let after = line[at + name.len()..].chars().next();
                !before.is_some_and(is_ident) && !after.is_some_and(is_ident)
            })
        })
}

fn is_ident(character: char) -> bool {
    character.is_alphanumeric() || character == '_'
}
