use keyring::{Entry, Error};

const SERVICE: &str = "com.vibyra.desktop";
const OPENAI_ACCOUNT: &str = "openai-api-key";
const VIBYRA_SESSION_ACCOUNT: &str = "vibyra-account-session";
const DISCORD_MODEL_WEBHOOK_ACCOUNT: &str = "discord-model-release-webhook";
const DISCORD_REPORT_WEBHOOK_ACCOUNT: &str = "discord-report-webhook";

pub struct SecretStore;

impl SecretStore {
    pub fn read_openai_key(&self) -> Result<Option<String>, String> {
        read_secret(OPENAI_ACCOUNT)
    }

    pub fn write_openai_key(&self, key: Option<&str>) -> Result<(), String> {
        write_secret(OPENAI_ACCOUNT, key)
    }

    pub fn read_account_session(&self) -> Result<Option<String>, String> {
        read_secret(VIBYRA_SESSION_ACCOUNT)
    }

    pub fn write_account_session(&self, token: Option<&str>) -> Result<(), String> {
        write_secret(VIBYRA_SESSION_ACCOUNT, token)
    }

    pub fn read_discord_model_webhook(&self) -> Result<Option<String>, String> {
        read_secret(DISCORD_MODEL_WEBHOOK_ACCOUNT)
    }

    pub fn write_discord_model_webhook(&self, webhook: Option<&str>) -> Result<(), String> {
        write_secret(DISCORD_MODEL_WEBHOOK_ACCOUNT, webhook)
    }

    /// Kept apart from the model-alert webhook on purpose: they point at
    /// different channels, and revoking one must never silence the other.
    pub fn read_report_webhook(&self) -> Result<Option<String>, String> {
        read_secret(DISCORD_REPORT_WEBHOOK_ACCOUNT)
    }

    pub fn write_report_webhook(&self, webhook: Option<&str>) -> Result<(), String> {
        write_secret(DISCORD_REPORT_WEBHOOK_ACCOUNT, webhook)
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
    Entry::new(SERVICE, account).map_err(message)
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
    use super::normalize_key;

    #[test]
    fn key_normalization_drops_empty_values() {
        assert_eq!(normalize_key("  ".into()), None);
        assert_eq!(
            normalize_key(" sk-test \n".into()).as_deref(),
            Some("sk-test")
        );
    }
}
