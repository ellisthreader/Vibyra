//! Program names as `Command` will find them without a shell.

/// Node ships its CLIs as `.cmd` shims on Windows, and `Command` without a
/// shell will not find the extensionless name.
const SHIMMED: [&str; 4] = ["npm", "npx", "yarn", "pnpm"];

pub fn resolve_program(program: &str) -> String {
    resolve_for(cfg!(windows), program)
}

/// The platform is a parameter so every build tests the Windows rule.
pub(crate) fn resolve_for(windows: bool, program: &str) -> String {
    if windows && SHIMMED.contains(&program) {
        format!("{program}.cmd")
    } else {
        program.to_owned()
    }
}

#[cfg(test)]
mod tests {
    use super::resolve_for;

    #[test]
    fn only_windows_node_shims_gain_the_cmd_suffix() {
        assert_eq!(resolve_for(true, "npm"), "npm.cmd");
        assert_eq!(resolve_for(true, "cargo"), "cargo");
        assert_eq!(resolve_for(false, "npm"), "npm");
    }
}
