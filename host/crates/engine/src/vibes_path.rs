//! Which project paths the AI project tools (`vibes.tool`: list, read, write, search) may name.
//!
//! Agent V2 refuses every dot-leading path component before a request reaches the engine; this is the
//! engine's own copy of that rule, so a caller that does not pre-filter gets the same answer.

/// True when one path component is off limits: anything that starts with a dot (`.git`, `.env`,
/// `.env.local`, `.ssh`, `.github` ...) or `node_modules`. Letter case never matters, because
/// APFS and NTFS resolve `.GIT/config` and `.ENV` to the real files.
pub(crate) fn blocked_component(name: &str) -> bool {
    name.starts_with('.') || name.eq_ignore_ascii_case("node_modules")
}

/// True when any component of `path` is blocked. `\` separates components too, so a Windows-style
/// `.git\config` cannot slip past a check that only looks at `/`.
pub(crate) fn blocked(path: &str) -> bool {
    path.split(['/', '\\']).any(blocked_component)
}

/// Entries a project search never opens. `.git`, `.env`, `.env.*`, `node_modules`, `.DS_Store` and
/// `.vibyra-agent` are skipped for everyone, in any letter case; `strict` (the AI tools) also skips
/// every other blocked component.
pub(crate) fn search_skips(name: &str, strict: bool) -> bool {
    let lower = name.to_ascii_lowercase();
    (strict && blocked_component(name))
        || matches!(
            lower.as_str(),
            ".git" | ".env" | "node_modules" | ".ds_store" | ".vibyra-agent"
        )
        || lower.starts_with(".env.")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dot_leading_and_dependency_components_are_blocked_in_any_case() {
        for path in [
            ".git",
            ".GIT/config",
            ".Git",
            ".ENV",
            ".Env.local",
            ".env.",
            "a/.git/config",
            "a/b/.GIT/HEAD",
            "src\\.git\\config",
            "node_modules",
            "Node_Modules/x",
            "NODE_MODULES",
            ".github/ci.yml",
            ".",
            "a/./b/.ssh",
        ] {
            assert!(blocked(path), "{path} must be blocked");
        }
    }

    #[test]
    fn ordinary_paths_are_not_blocked() {
        for path in [
            "",
            "src/main.rs",
            "docs/git.md",
            "env.txt",
            "my.env/file",
            "a/node_modules_x/b",
            "a//b",
        ] {
            assert!(!blocked(path), "{path} must stay available");
        }
    }
}
