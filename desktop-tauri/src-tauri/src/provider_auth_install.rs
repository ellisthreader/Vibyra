use std::process::Command;

use vibyra_core::agents::program_in_path;

use crate::provider_auth_state::ProviderDefinition;

/// Node ships npm as a shell script on Windows, which `CreateProcess` will not
/// run by name; the account CLIs are npm packages on every platform, so the
/// difference is only in how the command is spelled.
#[cfg(windows)]
const LAUNCHER: &str = "cmd";
#[cfg(not(windows))]
const LAUNCHER: &str = "npm";

/// The command that puts `provider.program` on this machine.
///
/// Refusing early with the command spelled out matters more than it looks: the
/// alternative is a row that can only say "install it yourself" and never says
/// how.
pub fn install_command(provider: ProviderDefinition) -> Result<Command, String> {
    if !program_in_path(LAUNCHER) && !program_in_path("npm") {
        return Err(format!(
            "Installing {} needs npm, which this machine does not have. \
             Install Node.js, then run: npm install -g {}",
            provider.product, provider.package
        ));
    }
    let mut command = Command::new(LAUNCHER);
    command.args(arguments(provider.package));
    Ok(command)
}

fn arguments(package: &str) -> Vec<String> {
    let install = ["install", "--global", package];
    #[cfg(windows)]
    {
        let mut args = vec!["/C".to_string(), "npm".to_string()];
        args.extend(install.iter().map(|value| (*value).to_string()));
        args
    }
    #[cfg(not(windows))]
    {
        install.iter().map(|value| (*value).to_string()).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::arguments;
    use crate::provider_auth_state::definition;

    #[test]
    fn installs_the_documented_package_for_each_account() {
        for (id, package) in [
            ("codex", "@openai/codex"),
            ("claude", "@anthropic-ai/claude-code"),
            ("gemini", "@google/gemini-cli"),
        ] {
            let provider = definition(id).unwrap();
            assert_eq!(provider.package, package);
            assert!(arguments(provider.package).contains(&package.to_string()));
        }
    }

    #[test]
    fn the_install_is_global_and_never_touches_the_current_project() {
        let args = arguments("@openai/codex");
        assert!(args.contains(&"--global".to_string()));
        assert!(!args.iter().any(|arg| arg == "--save" || arg == "-D"));
    }
}
