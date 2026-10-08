//! A compact, factual briefing about one project, for the chat system prompt.
//!
//! The assistant used to be told only a name and a path, so it answered with
//! generic `ls -la` and `pwd` suggestions — even for a folder holding no code
//! at all. This builds the briefing from readers the app already has: the Git
//! inventory, Git status, the preview stack detector and the directory
//! listing. It never shells out on its own.

mod budget;
mod changes;
mod sections;

#[cfg(test)]
mod tests;

use std::path::Path;

use serde::Serialize;

use crate::fsx::{self, DirEntryInfo};
use crate::preview::{inspect_project, PreviewTarget};
use crate::workspace_preflight::is_git_work_tree;

pub use budget::TOTAL_CHARS;

/// Files that make a folder a codebase even without Git behind it.
const MANIFESTS: [&str; 11] = [
    "package.json",
    "Cargo.toml",
    "pyproject.toml",
    "go.mod",
    "composer.json",
    "Gemfile",
    "pom.xml",
    "build.gradle",
    "Makefile",
    "makefile",
    "CMakeLists.txt",
];

/// `inspect_project` always answers with something, so these two placeholder
/// frameworks mean "nothing detected" rather than a stack.
const PLACEHOLDERS: [&str; 2] = ["No browser preview", "Could not inspect app"];

/// What the folder actually is. Every honesty rule in the brief hangs off this.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Shape {
    Repository,
    Folder,
    Plain,
    Missing,
}

pub struct BriefInput<'a> {
    pub name: &'a str,
    pub root: &'a Path,
    /// Rendered terminal lines the shell crate appends; it owns the PTY manager.
    pub terminals: Vec<String>,
    /// Project memory text the shell crate has already read.
    pub memory: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Brief {
    pub text: String,
    pub shape: Shape,
    pub codebase: bool,
    pub chars: usize,
    pub truncated: Vec<String>,
}

pub fn build(input: &BriefInput) -> Brief {
    if !input.root.is_dir() {
        return unbuilt(Shape::Missing, missing_text(input.root));
    }
    let entries = fsx::list_dir(&input.root.to_string_lossy(), false).unwrap_or_default();
    let targets = stack_targets(input.root);
    let shape = if is_git_work_tree(input.root) {
        Shape::Repository
    } else if has_manifest(&entries) || !targets.is_empty() {
        Shape::Folder
    } else {
        return unbuilt(Shape::Plain, plain_text(input.root, entries.len()));
    };

    let scripts = sections::scripts(input.root, &entries);
    let (text, truncated) = budget::assemble(vec![
        budget::section("identity", sections::identity(input, shape), 260, 0),
        budget::section("stack", sections::stack(&targets, &scripts), 300, 0),
        budget::section("scripts", scripts, 260, 0),
        budget::section("layout", sections::layout(&entries), 380, 0),
        budget::section("git", changes::section(input.root, shape), 700, 1),
        budget::section("terminals", sections::terminals(&input.terminals), 300, 0),
        budget::section("memory", sections::memory(input.memory.as_deref()), 800, 2),
    ]);
    Brief {
        chars: text.len(),
        text,
        shape,
        codebase: true,
        truncated,
    }
}

/// The fix for the reported bug. A folder of installed apps is not a project,
/// and the only useful thing to say about it is exactly that.
fn plain_text(root: &Path, entries: usize) -> String {
    let path = root.display();
    let count = if entries == 1 {
        "1 entry".to_string()
    } else {
        format!("{entries} entries")
    };
    format!(
        "This folder is not a code project. {path} is not a Git repository. It has no \
         project manifest (no package.json, Cargo.toml, pyproject.toml, go.mod, \
         composer.json, Gemfile, pom.xml or Makefile) and nothing Vibyra can preview or \
         build. Its top level is {count}.\n\nDo not invent a build, test or run command \
         for this folder, and do not describe it as a project. If the person asks what to \
         do here, say plainly that Vibyra has not been pointed at a codebase yet, and \
         offer to open a different folder."
    )
}

fn missing_text(root: &Path) -> String {
    let path = root.display();
    format!(
        "Vibyra cannot see this folder. {path} is not on this computer right now, or is \
         not a folder at all.\n\nDo not invent a build, test or run command for it, and \
         do not describe what it contains. Say that the folder is missing, and offer to \
         open a different one."
    )
}

/// A shape with nothing to brief: one paragraph replaces the whole thing, so
/// there is no section for the model to read past.
fn unbuilt(shape: Shape, text: String) -> Brief {
    Brief {
        chars: text.len(),
        text,
        shape,
        codebase: false,
        truncated: Vec::new(),
    }
}

fn stack_targets(root: &Path) -> Vec<PreviewTarget> {
    let Ok(inspection) = inspect_project(&root.to_string_lossy()) else {
        return Vec::new();
    };
    inspection
        .targets
        .into_iter()
        .filter(|target| !PLACEHOLDERS.contains(&target.framework.as_str()))
        .collect()
}

fn has_manifest(entries: &[DirEntryInfo]) -> bool {
    entries
        .iter()
        .any(|entry| MANIFESTS.contains(&entry.name.as_str()) || entry.name.ends_with(".xcodeproj"))
}
