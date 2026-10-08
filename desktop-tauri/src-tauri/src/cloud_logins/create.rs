//! Run the provider CLI inside a private temporary home, never its local account.
mod claude;
mod codex;
mod launcher;
pub(super) use launcher::find as program;
use launcher::Program;
use std::time::Duration;

const SIGN_IN_LIMIT: Duration = Duration::from_secs(600);
const MAX_LOGIN_BYTES: u64 = 64 * 1024;
const STRIPPED: [&str; 8] = [
    "ANTHROPIC_API_KEY",
    "CLAUDE_CODE_OAUTH_TOKEN",
    "CLAUDE_CONFIG_DIR",
    "OPENAI_API_KEY",
    "CODEX_API_KEY",
    "CODEX_HOME",
    "ANTHROPIC_AUTH_TOKEN",
    "OPENAI_BASE_URL",
];

struct Scratch(tempfile::TempDir);
impl Scratch {
    fn new() -> Result<Self, String> {
        let dir = tempfile::Builder::new()
            .prefix("vibyra-cloud-login-")
            .tempdir()
            .map_err(|_| "Vibyra could not prepare the sign-in.".to_string())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(dir.path(), std::fs::Permissions::from_mode(0o700))
                .map_err(|_| "Vibyra could not prepare the sign-in.".to_string())?;
        }
        Ok(Self(dir))
    }
}
fn name(provider: &str) -> &'static str {
    if provider == "claude" {
        "Claude"
    } else {
        "Codex"
    }
}
pub(super) fn create(
    provider: &str,
    interrupted: &(dyn Fn() -> bool + Sync),
) -> Result<Vec<u8>, String> {
    let program = program(provider)
        .ok_or_else(|| format!("{} is not installed on this computer.", name(provider)))?;
    match provider {
        "codex" => codex::create(&program, interrupted),
        "claude" => claude::create(&program, interrupted),
        _ => Err("That account cannot go to Vibyra Cloud.".into()),
    }
}
fn stopped(interrupted: &(dyn Fn() -> bool + Sync), who: &str) -> String {
    if interrupted() {
        format!("{who} sign-in was stopped.")
    } else {
        format!("{who} wasn't allowed within 10 minutes. Try again.")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn scratch_folder_is_private_and_removed() {
        let scratch = Scratch::new().unwrap();
        let path = scratch.0.path().to_owned();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                std::fs::metadata(&path).unwrap().permissions().mode() & 0o777,
                0o700
            );
        }
        std::fs::write(path.join("auth.json"), "{}").unwrap();
        drop(scratch);
        assert!(!path.exists());
    }
}
