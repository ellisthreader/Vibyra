//! JSON-aware `cwd` rewrite of one transcript line. Only a top-level `cwd` and, for a top-level
//! `"type":"session_meta"`, `payload.cwd` are touched; every other byte of the line is kept as it was (a message
//! that merely mentions the path is not edited). A tiny scanner finds the value spans, so key order and number
//! formatting are never disturbed.

/// Returns the end of the JSON value starting at `i` (after optional whitespace).
fn skip_value(b: &[u8], mut i: usize) -> Option<usize> {
    while b.get(i)?.is_ascii_whitespace() {
        i += 1;
    }
    match b[i] {
        b'"' => {
            i += 1;
            while *b.get(i)? != b'"' {
                i += if b[i] == b'\\' { 2 } else { 1 };
            }
            Some(i + 1)
        }
        b'{' | b'[' => {
            let (open, close) = if b[i] == b'{' {
                (b'{', b'}')
            } else {
                (b'[', b']')
            };
            let mut depth = 0usize;
            while i < b.len() {
                match b[i] {
                    b'"' => i = skip_value(b, i)? - 1,
                    c if c == open => depth += 1,
                    c if c == close => {
                        depth -= 1;
                        if depth == 0 {
                            return Some(i + 1);
                        }
                    }
                    _ => {}
                }
                i += 1;
            }
            None
        }
        _ => {
            while i < b.len() && !matches!(b[i], b',' | b'}' | b']') && !b[i].is_ascii_whitespace()
            {
                i += 1;
            }
            Some(i)
        }
    }
}

/// `(key, value start, value end)` for each member of the object that starts at `start`.
fn members(b: &[u8], start: usize) -> Option<Vec<(String, usize, usize)>> {
    let mut i = start;
    while b.get(i)?.is_ascii_whitespace() {
        i += 1;
    }
    if b[i] != b'{' {
        return None;
    }
    i += 1;
    let mut out = vec![];
    loop {
        while b.get(i)?.is_ascii_whitespace() || b[i] == b',' {
            i += 1;
        }
        if b[i] == b'}' {
            return Some(out);
        }
        let key_end = skip_value(b, i)?;
        let key: String = serde_json::from_slice(&b[i..key_end]).ok()?;
        i = key_end;
        while b.get(i)?.is_ascii_whitespace() {
            i += 1;
        }
        if b[i] != b':' {
            return None;
        }
        i += 1;
        while b.get(i)?.is_ascii_whitespace() {
            i += 1;
        }
        let end = skip_value(b, i)?;
        out.push((key, i, end));
        i = end;
    }
}

fn remap(value: &[u8], from: &str, to: &str) -> Option<String> {
    let cwd: String = serde_json::from_slice(value).ok()?;
    let from = from.trim_end_matches('/');
    let tail = if cwd == from {
        ""
    } else if cwd.starts_with(from) && cwd[from.len()..].starts_with('/') {
        &cwd[from.len()..]
    } else {
        return None;
    };
    serde_json::to_string(&format!("{}{tail}", to.trim_end_matches('/'))).ok()
}

/// The line with its `cwd` moved from `from` to `to` (a subfolder keeps its tail), or `None` if nothing changes.
pub fn rewrite_line(line: &[u8], from: &str, to: &str) -> Option<Vec<u8>> {
    let plain = from.is_ascii() && !from.contains(['"', '\\']);
    if from == to
        || (plain
            && !line
                .windows(from.len().max(1))
                .any(|w| w == from.as_bytes()))
    {
        return None;
    }
    let top = members(line, 0)?;
    let mut edits: Vec<(usize, usize, String)> = vec![];
    let is_meta = top
        .iter()
        .any(|(k, s, e)| k == "type" && &line[*s..*e] == b"\"session_meta\"");
    for (key, s, e) in &top {
        if key == "cwd" {
            if let Some(new) = remap(&line[*s..*e], from, to) {
                edits.push((*s, *e, new));
            }
        } else if key == "payload" && is_meta {
            for (k2, s2, e2) in members(line, *s).unwrap_or_default() {
                if k2 == "cwd" {
                    if let Some(new) = remap(&line[s2..e2], from, to) {
                        edits.push((s2, e2, new));
                    }
                }
            }
        }
    }
    if edits.is_empty() {
        return None;
    }
    edits.sort();
    let mut out = Vec::with_capacity(line.len() + 32);
    let mut at = 0;
    for (s, e, new) in edits {
        out.extend_from_slice(&line[at..s]);
        out.extend_from_slice(new.as_bytes());
        at = e;
    }
    out.extend_from_slice(&line[at..]);
    Some(out)
}

/// First `cwd` a codex rollout recorded: `payload.cwd` of its `session_meta` line.
pub fn session_meta_cwd(line: &[u8]) -> Option<String> {
    let top = members(line, 0)?;
    if !top
        .iter()
        .any(|(k, s, e)| k == "type" && &line[*s..*e] == b"\"session_meta\"")
    {
        return None;
    }
    let (_, s, _) = top.iter().find(|(k, _, _)| k == "payload")?;
    let (_, s2, e2) = members(line, *s)?
        .into_iter()
        .find(|(k, _, _)| k == "cwd")?;
    serde_json::from_slice(&line[s2..e2]).ok()
}
