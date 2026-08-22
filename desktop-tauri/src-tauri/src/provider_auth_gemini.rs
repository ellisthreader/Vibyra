use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::Value;

use crate::provider_auth_gemini_account::email;
use crate::provider_auth_home::AccountHome;
use crate::provider_auth_identity::safe_label;
use crate::provider_auth_state::AuthSnapshot;

pub fn probe(home: &AccountHome) -> AuthSnapshot {
    probe_home(&home.credentials_dir())
}

fn probe_home(home: &Path) -> AuthSnapshot {
    let settings = match read_json(home.join("settings.json")) {
        JsonFile::Value(value) => value,
        JsonFile::Missing => return AuthSnapshot::default(),
        JsonFile::Invalid => return AuthSnapshot::failed(),
    };
    if !settings.is_object() {
        return AuthSnapshot::failed();
    }
    let selected = settings
        .pointer("/security/auth/selectedType")
        .and_then(Value::as_str);
    if selected != Some("oauth-personal") {
        return AuthSnapshot::default();
    }
    let credentials = match read_json(home.join("oauth_creds.json")) {
        JsonFile::Value(value) => value,
        JsonFile::Missing => return AuthSnapshot::default(),
        JsonFile::Invalid => return AuthSnapshot::failed(),
    };
    if !usable_credentials(&credentials) {
        return AuthSnapshot::failed();
    }
    AuthSnapshot {
        connected: true,
        account_label: safe_label(&email(home), "Google account"),
        // Not a plan, because Gemini has no plan to read: its Code Assist tier
        // comes back from a `loadCodeAssist` call at runtime and is never
        // written to disk. What *is* known locally is how this account signs
        // in — a personal Google sign-in rather than an API key or Vertex —
        // which is the distinction that actually changes what the CLI can do.
        detail: "Gemini · personal Google sign-in".into(),
        ..AuthSnapshot::default()
    }
}

fn usable_credentials(value: &Value) -> bool {
    let Some(credentials) = value.as_object() else {
        return false;
    };
    let refresh = credentials
        .get("refresh_token")
        .and_then(Value::as_str)
        .is_some_and(usable_token);
    let access = credentials
        .get("access_token")
        .and_then(Value::as_str)
        .is_some_and(usable_token);
    let expiry = credentials.get("expiry_date").and_then(Value::as_u64);
    refresh || (access && expiry.is_some_and(|value| value > now_millis()))
}

fn usable_token(value: &str) -> bool {
    value.len() >= 24 && !value.chars().any(char::is_whitespace)
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX)
}

enum JsonFile {
    Missing,
    Invalid,
    Value(Value),
}

fn read_json(path: PathBuf) -> JsonFile {
    match std::fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes)
            .map(JsonFile::Value)
            .unwrap_or(JsonFile::Invalid),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => JsonFile::Missing,
        Err(_) => JsonFile::Invalid,
    }
}

#[cfg(test)]
mod tests {
    use super::probe_home;
    use serde_json::json;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicU64, Ordering};

    static FIXTURE_ID: AtomicU64 = AtomicU64::new(1);

    struct TestHome(PathBuf);

    impl TestHome {
        fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for TestHome {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn home(settings: serde_json::Value, credentials: serde_json::Value) -> TestHome {
        let id = FIXTURE_ID.fetch_add(1, Ordering::Relaxed);
        let path =
            std::env::temp_dir().join(format!("vibyra-gemini-auth-{}-{id}", std::process::id()));
        fs::create_dir(&path).unwrap();
        fs::write(path.join("settings.json"), settings.to_string()).unwrap();
        fs::write(path.join("oauth_creds.json"), credentials.to_string()).unwrap();
        TestHome(path)
    }

    #[test]
    fn arbitrary_non_empty_token_is_not_connected() {
        let home = home(
            json!({ "security": { "auth": { "selectedType": "oauth-personal" } } }),
            json!({ "refresh_token": "fake" }),
        );
        let snapshot = probe_home(home.path());
        assert!(!snapshot.connected);
        assert!(snapshot.probe_failed);
    }

    /// The reported bug on this row: a connected account that only ever said
    /// "Google account". The CLI caches which one it is, so the row names it.
    #[test]
    fn names_the_signed_in_google_account() {
        let home = home(
            json!({ "security": { "auth": { "selectedType": "oauth-personal" } } }),
            json!({ "refresh_token": "1//fixture-refresh-token-with-safe-length" }),
        );
        fs::write(
            home.path().join("google_accounts.json"),
            json!({ "active": "person@example.test", "old": [] }).to_string(),
        )
        .unwrap();
        assert_eq!(probe_home(home.path()).account_label, "person@example.test");
    }

    #[test]
    fn provider_shaped_refresh_credential_is_connected() {
        let home = home(
            json!({ "security": { "auth": { "selectedType": "oauth-personal" } } }),
            json!({ "refresh_token": "1//fixture-refresh-token-with-safe-length" }),
        );
        let snapshot = probe_home(home.path());
        assert!(snapshot.connected);
        assert!(!snapshot.probe_failed);
    }
}
