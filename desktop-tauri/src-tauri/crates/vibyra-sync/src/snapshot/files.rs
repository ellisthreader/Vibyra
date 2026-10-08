//! Which paths a snapshot considers: tracked + untracked, `.gitignore` honoured. Nothing here runs
//! repository-defined code (`ls-files` reads the index and ignore files as data).
use crate::error::Result;
use crate::git::Git;
use std::collections::{BTreeSet, HashMap};
use std::path::Path;

/// Relative, `/`-separated paths; entries ending in `/` (nested repositories) and non-UTF-8 names are dropped
/// into `odd` so the caller can report them.
pub struct Listing {
    pub paths: BTreeSet<String>,
    pub odd: Vec<(String, &'static str)>,
}

/// Generated folders that are never worth keeping in the cloud even when a project's .gitignore forgets them (an agent can
/// rebuild them there). They apply to UNTRACKED files only, so a folder a project deliberately commits is still kept.
pub const GENERATED: &[&str] = &[
    "node_modules",
    "target",
    "dist",
    "build",
    "output",
    ".next",
    ".nuxt",
    ".expo",
    ".turbo",
    ".cache",
    "coverage",
    "Pods",
    "DerivedData",
    ".venv",
    "venv",
    "__pycache__",
    ".gradle",
    ".dart_tool",
    ".parcel-cache",
    ".svelte-kit",
    ".vercel",
];

/// `ls-files` arguments: the defaults above plus the project's own `.vibyraignore` (gitignore syntax, at its root).
fn listing_args(root: &Path, tracked: bool) -> Vec<String> {
    let mut args: Vec<String> = ["ls-files", "-z"].iter().map(|s| s.to_string()).collect();
    if tracked {
        args.push("-c".into());
    }
    args.extend(["-o".into(), "--exclude-standard".into()]);
    for dir in GENERATED {
        args.push(format!("--exclude={dir}/"));
    }
    let own = root.join(".vibyraignore");
    if own.is_file() {
        args.push(format!("--exclude-from={}", own.display()));
    }
    args
}

pub fn list(root: &Path, shadow: &Git) -> Result<Listing> {
    let raw = if root.join(".git").exists() {
        // The person's own repository: tracked files plus untracked-not-ignored.
        let args = listing_args(root, true);
        Git::in_dir(root).out(&args.iter().map(String::as_str).collect::<Vec<_>>())?
    } else {
        // A plain folder: the empty shadow repo reads the folder's own .gitignore files as its work tree, so a
        // parent repository (if any) never leaks in.
        let args = listing_args(root, false);
        shadow
            .clone()
            .with_work_tree(root)
            .out(&args.iter().map(String::as_str).collect::<Vec<_>>())?
    };
    let mut paths = BTreeSet::new();
    let mut odd = vec![];
    let mut nested: HashMap<String, bool> = HashMap::new();
    for rec in raw.split(|b| *b == 0).filter(|r| !r.is_empty()) {
        let Ok(path) = std::str::from_utf8(rec) else {
            odd.push((
                String::from_utf8_lossy(rec).into_owned(),
                "name is not valid UTF-8",
            ));
            continue;
        };
        if path.ends_with('/') {
            odd.push((path.to_string(), "nested repository"));
        } else if path.split('/').any(|part| part == ".git") {
            continue;
        } else if let Some(dir) = nested_repo(root, path, &mut nested) {
            odd.push((format!("{dir}/"), "nested repository"));
        } else {
            paths.insert(path.to_string());
        }
    }
    Ok(Listing { paths, odd })
}

/// The folder of the first ancestor below `root` that has its own `.git` (a checkout inside the project).
fn nested_repo(root: &Path, path: &str, seen: &mut HashMap<String, bool>) -> Option<String> {
    let parts: Vec<&str> = path.split('/').collect();
    let mut dir = String::new();
    for part in &parts[..parts.len() - 1] {
        if !dir.is_empty() {
            dir.push('/');
        }
        dir.push_str(part);
        let has_git = *seen
            .entry(dir.clone())
            .or_insert_with(|| root.join(&dir).join(".git").exists());
        if has_git {
            return Some(dir);
        }
    }
    None
}
