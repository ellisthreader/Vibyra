use keyring::{Entry, Error};
use parking_lot::Mutex;

const SERVICE: &str = "com.vibyra.desktop";
const DEV_SERVICE: &str = "com.vibyra.desktop.dev.local";
const OPENAI_ACCOUNT: &str = "openai-api-key";
const VIBYRA_SESSION_ACCOUNT: &str = "vibyra-account-session";
const DISCORD_REPORT_WEBHOOK_ACCOUNT: &str = "discord-report-webhook";

pub struct SecretStore;

/// The session token as last read from the store, until the next session
/// write. Launch reads the token, verifies it, and adopts it — which wrote the
/// same bytes straight back: a Keychain write on every launch, and a second
/// access prompt whenever the item's ACL does not yet include this build.
static SESSION_JUST_READ: Mutex<Option<String>> = Mutex::new(None);

impl SecretStore {
    pub fn read_openai_key(&self) -> Result<Option<String>, String> {
        read_secret(OPENAI_ACCOUNT)
    }

    pub fn write_openai_key(&self, key: Option<&str>) -> Result<(), String> {
        write_secret(OPENAI_ACCOUNT, key)
    }

    pub fn read_account_session(&self) -> Result<Option<String>, String> {
        let token = read_secret(VIBYRA_SESSION_ACCOUNT)?;
        SESSION_JUST_READ.lock().clone_from(&token);
        Ok(token)
    }

    /// Skips only the one write that would put back exactly what the store
    /// was just read as holding; any other write goes through and forgets it.
    pub fn write_account_session(&self, token: Option<&str>) -> Result<(), String> {
        let just_read = SESSION_JUST_READ.lock().take();
        if already_stored(token, just_read.as_deref()) {
            return Ok(());
        }
        write_secret(VIBYRA_SESSION_ACCOUNT, token)
    }

    pub fn read_report_webhook(&self) -> Result<Option<String>, String> {
        read_secret(DISCORD_REPORT_WEBHOOK_ACCOUNT)
    }

    pub fn write_report_webhook(&self, webhook: Option<&str>) -> Result<(), String> {
        write_secret(DISCORD_REPORT_WEBHOOK_ACCOUNT, webhook)
    }

    pub fn read_agent_runner_key(&self, grant_id: &str) -> Result<Option<String>, String> {
        read_secret(&format!("agent-runner-{grant_id}"))
    }

    pub fn write_agent_runner_key(&self, grant_id: &str, key: Option<&str>) -> Result<(), String> {
        write_secret(&format!("agent-runner-{grant_id}"), key)
    }
}

fn read_secret(account: &str) -> Result<Option<String>, String> {
    match entry(account)?.get_password() {
        Ok(value) => Ok(normalize_key(value)),
        Err(Error::NoEntry) => Ok(None),
        Err(error) => Err(message(error)),
    }
}

fn write_secret(account: &str, value: Option<&str>) -> Result<(), String> {
    let entry = entry(account)?;
    match value.map(str::trim).filter(|value| !value.is_empty()) {
        Some(value) => entry.set_password(value).map_err(message),
        None => match entry.delete_credential() {
            Ok(()) | Err(Error::NoEntry) => Ok(()),
            Err(error) => Err(message(error)),
        },
    }
}

fn entry(account: &str) -> Result<Entry, String> {
    let local_api = std::env::var("VIBYRA_DESKTOP_API_URL")
        .ok()
        .is_some_and(|url| {
            url.starts_with("http://127.0.0.1:") || url.starts_with("http://localhost:")
        });
    let service = if local_api {
        std::env::var("VIBYRA_DESKTOP_SECRET_SERVICE")
            .ok()
            .filter(|value| value.starts_with("com.vibyra.desktop.dev.") && value.len() <= 100)
    } else {
        None
    };
    Entry::new(
        service
            .as_deref()
            .unwrap_or(if local_api { DEV_SERVICE } else { SERVICE }),
        account,
    )
    .map_err(message)
}

fn already_stored(token: Option<&str>, just_read: Option<&str>) -> bool {
    let token = token.map(str::trim).filter(|token| !token.is_empty());
    token.is_some() && token == just_read
}

fn normalize_key(key: String) -> Option<String> {
    let key = key.trim();
    (!key.is_empty()).then(|| key.to_owned())
}

fn message(error: Error) -> String {
    format!("operating-system credential store is unavailable: {error}")
}

#[cfg(test)]
mod tests {
    use super::{already_stored, normalize_key};

    #[test]
    fn only_rewriting_the_token_just_read_is_skipped() {
        assert!(already_stored(Some(" tok "), Some("tok")));
        assert!(!already_stored(Some("new"), Some("tok")));
        assert!(!already_stored(Some("tok"), None));
        assert!(!already_stored(None, None));
    }

    #[test]
    fn key_normalization_drops_empty_values() {
        assert_eq!(normalize_key("  ".into()), None);
        assert_eq!(
            normalize_key(" sk-test \n".into()).as_deref(),
            Some("sk-test")
        );
    }
}
