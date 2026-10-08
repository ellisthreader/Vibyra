//! The project instruction files an agent reads on start (`AGENTS.md`,
//! `CLAUDE.md`, `GEMINI.md`, `.cursor/rules/*`): which ones a project has, and
//! the extra rules a save of one must meet. They are checked lexically and with
//! `lstat`, never by following a link: a link is listed but not written, so an
//! instruction file can never be a way to write somewhere else.

use std::path::{Path, PathBuf};

use serde::Serialize;

use super::scope::{slash_path, split};
use crate::{CoreError, CoreResult};

/// Instruction files are short notes; anything larger is not one.
pub const INSTRUCTION_LIMIT_BYTES: u64 = 256 * 1024;
const ROOT_FILES: [&str; 3] = ["AGENTS.md", "CLAUDE.md", "GEMINI.md"];
const RULES_DIR: [&str; 2] = [".cursor", "rules"];
const MAX_RULES: usize = 60;
const MAX_DEPTH: usize = 3;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InstructionFile {
    /// Relative to the project root, joined with '/'.
    pub rel_path: String,
    pub size: u64,
    /// Where a link points. A linked file is listed but never written.
    pub link: Option<String>,
}

fn refuse(message: &str) -> CoreError {
    CoreError::InvalidPath(message.into())
}

fn is_rule(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.ends_with(".md") || lower.ends_with(".mdc")
}

/// Whether a root-relative path names an instruction file. Names fold case
/// because macOS and Windows do.
pub fn is_instruction_path(rel: &str) -> bool {
    let parts: Vec<&str> = rel.split('/').collect();
    match parts.as_slice() {
        [name] => ROOT_FILES
            .iter()
            .any(|file| name.eq_ignore_ascii_case(file)),
        [first, second, rest @ ..] => {
            first.eq_ignore_ascii_case(RULES_DIR[0])
                && second.eq_ignore_ascii_case(RULES_DIR[1])
                && !rest.is_empty()
                && rest.len() < MAX_DEPTH
                && rest.last().is_some_and(|name| is_rule(name))
        }
        _ => false,
    }
}

fn entry(root: &Path, rel: &str) -> Option<InstructionFile> {
    let meta = std::fs::symlink_metadata(root.join(rel)).ok()?;
    if meta.file_type().is_symlink() {
        let target = std::fs::read_link(root.join(rel)).ok()?;
        return Some(InstructionFile {
            rel_path: rel.into(),
            size: 0,
            link: Some(target.to_string_lossy().into_owned()),
        });
    }
    meta.is_file().then(|| InstructionFile {
        rel_path: rel.into(),
        size: meta.len(),
        link: None,
    })
}

fn is_real_dir(path: &Path) -> bool {
    std::fs::symlink_metadata(path).is_ok_and(|meta| meta.is_dir())
}

fn collect_rules(root: &Path, rel: &str, depth: usize, out: &mut Vec<InstructionFile>) {
    let Ok(read) = std::fs::read_dir(root.join(rel)) else {
        return;
    };
    let mut names: Vec<String> = read
        .flatten()
        .filter_map(|item| item.file_name().into_string().ok())
        .collect();
    names.sort();
    for name in names {
        if out.len() >= MAX_RULES {
            return;
        }
        let child = format!("{rel}/{name}");
        if is_real_dir(&root.join(&child)) {
            if depth + 1 < MAX_DEPTH {
                collect_rules(root, &child, depth + 1, out);
            }
        } else if is_rule(&name) {
            out.extend(entry(root, &child));
        }
    }
}

/// The instruction files a project has, root files first. A `.cursor` or
/// `rules` folder that is itself a link is not entered.
pub fn list_instructions(root: &Path) -> Vec<InstructionFile> {
    let mut found: Vec<InstructionFile> = ROOT_FILES
        .iter()
        .filter_map(|name| entry(root, name))
        .collect();
    let cursor = root.join(RULES_DIR[0]);
    if is_real_dir(&cursor) && is_real_dir(&cursor.join(RULES_DIR[1])) {
        collect_rules(root, ".cursor/rules", 1, &mut found);
    }
    found
}

fn line_ending(bytes: &[u8]) -> &'static str {
    let lf = bytes.iter().filter(|byte| **byte == b'\n').count();
    let crlf = bytes.windows(2).filter(|pair| pair == b"\r\n").count();
    if crlf > 0 && crlf * 2 >= lf {
        "\r\n"
    } else {
        "\n"
    }
}

/// The editor keeps lines apart with `\n`; a file that used `\r\n` gets it back.
pub fn with_line_ending(text: &str, existing: Option<&[u8]>) -> String {
    let plain = text.replace("\r\n", "\n");
    match existing.map(line_ending) {
        Some("\r\n") => plain.replace('\n', "\r\n"),
        _ => plain,
    }
}

fn no_link() -> CoreError {
    refuse("This file is a link to another file. Edit the file it points to.")
}

/// What to write for `path` in `root`: the text unchanged for any file that is
/// not an instruction file, otherwise the text in the file's own line ending
/// once no part of the path is a link, and the size is within the limit.
pub fn prepare_write(root: &Path, path: &str, text: &str) -> CoreResult<String> {
    let (canon_root, rel) = split(root, path)?;
    if !is_instruction_path(&slash_path(&rel)) {
        return Ok(text.to_owned());
    }
    if text.len() as u64 > INSTRUCTION_LIMIT_BYTES {
        return Err(refuse("Instruction files are limited to 256 KB."));
    }
    let mut at = PathBuf::from(&canon_root);
    let mut existing = None;
    for part in rel.components() {
        at.push(part);
        match std::fs::symlink_metadata(&at) {
            Ok(meta) if meta.file_type().is_symlink() => return Err(no_link()),
            Ok(meta) if meta.is_file() => existing = Some(super::file::read_capped(&at)?),
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => break,
            Err(error) => return Err(error.into()),
        }
    }
    Ok(with_line_ending(text, existing.as_deref()))
}

#[cfg(test)]
#[path = "instructions_tests.rs"]
mod tests;
