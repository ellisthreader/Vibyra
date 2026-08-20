use serde::Serialize;

/// Renderer-safe account states. The bearer token never leaves native code;
/// the renderer only ever sees these coarse states plus display fields.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum AccountStatus {
    Restoring,
    SignedOut,
    Authorizing,
    SignedIn,
    ConnectionError,
}

impl AccountStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            AccountStatus::Restoring => "restoring",
            AccountStatus::SignedOut => "signedOut",
            AccountStatus::Authorizing => "authorizing",
            AccountStatus::SignedIn => "signedIn",
            AccountStatus::ConnectionError => "connectionError",
        }
    }
}

/// Display-only profile details. Deliberately excludes ids, tokens, billing
/// internals, and anything else the UI has no business holding.
#[derive(Clone, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AccountProfile {
    pub name: String,
    pub email: String,
    pub provider: String,
    pub plan: String,
    pub email_verified: bool,
    /// Opaque stable scope for renderer-only, per-account welcome state.
    pub welcome_key: String,
}

#[derive(Clone, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AccountSnapshot {
    pub status: &'static str,
    pub profile: Option<AccountProfile>,
    pub error: Option<String>,
    pub pending_provider: Option<String>,
    pub secure_storage: bool,
}

/// Extracts the safe display profile from a backend `user` payload.
pub fn profile_from_user(user: &serde_json::Value) -> Option<AccountProfile> {
    let email = user.get("email")?.as_str()?.trim().to_owned();
    if email.is_empty() {
        return None;
    }
    let text = |key: &str, fallback: &str| {
        user.get(key)
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .unwrap_or(fallback)
            .to_owned()
    };
    Some(AccountProfile {
        name: text("name", ""),
        email,
        provider: text("provider", "email"),
        plan: text("plan", "free"),
        email_verified: user
            .get("emailVerified")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        welcome_key: welcome_key(user),
    })
}

fn welcome_key(user: &serde_json::Value) -> String {
    let stable_id = user
        .get("id")
        .and_then(|value| {
            value
                .as_str()
                .map(str::to_owned)
                .or_else(|| value.as_i64().map(|id| id.to_string()))
                .or_else(|| value.as_u64().map(|id| id.to_string()))
        })
        .unwrap_or_else(|| {
            let provider = user
                .get("provider")
                .and_then(|v| v.as_str())
                .unwrap_or("email");
            let email = user.get("email").and_then(|v| v.as_str()).unwrap_or("");
            format!("{provider}:{}", email.trim().to_lowercase())
        });
    let hash = format!("vibyra-account:{stable_id}")
        .bytes()
        .fold(0xcbf29ce484222325_u64, |value, byte| {
            (value ^ u64::from(byte)).wrapping_mul(0x100000001b3)
        });
    format!("vw_{hash:016x}")
}

#[cfg(test)]
mod tests {
    use super::{profile_from_user, AccountProfile, AccountSnapshot};

    #[test]
    fn profile_parses_safe_fields_only() {
        let user = serde_json::json!({
            "id": 7, "name": "Ada", "email": "ada@vibyra.app", "provider": "google",
            "plan": "pro", "emailVerified": true, "creditsBalance": 50
        });
        let profile = profile_from_user(&user).expect("profile");
        assert_eq!(profile.name, "Ada");
        assert_eq!(profile.provider, "google");
        assert!(profile.email_verified);
        assert!(profile.welcome_key.starts_with("vw_"));
        let raw = serde_json::to_string(&profile).expect("serialize");
        assert!(!raw.contains("credits"));
        assert!(!raw.contains("\"id\""));
    }

    #[test]
    fn profile_requires_an_email() {
        assert!(profile_from_user(&serde_json::json!({ "name": "x" })).is_none());
        assert!(profile_from_user(&serde_json::json!({ "email": "  " })).is_none());
    }

    #[test]
    fn welcome_scope_survives_profile_email_changes() {
        let first = profile_from_user(&serde_json::json!({
            "id": 42, "email": "first@vibyra.app"
        }))
        .expect("first profile");
        let changed = profile_from_user(&serde_json::json!({
            "id": 42, "email": "changed@vibyra.app"
        }))
        .expect("changed profile");
        assert_eq!(first.welcome_key, changed.welcome_key);
        assert!(!first.welcome_key.contains("42"));
    }

    #[test]
    fn snapshot_serialization_never_carries_credentials() {
        let snapshot = AccountSnapshot {
            status: "signedIn",
            profile: Some(AccountProfile {
                name: "Ada".into(),
                email: "ada@vibyra.app".into(),
                provider: "email".into(),
                plan: "free".into(),
                email_verified: false,
                welcome_key: "vw_test".into(),
            }),
            error: None,
            pending_provider: None,
            secure_storage: true,
        };
        let raw = serde_json::to_string(&snapshot).expect("serialize");
        assert!(!raw.to_lowercase().contains("token"));
        assert!(!raw.to_lowercase().contains("secret"));
        assert!(raw.contains("\"secureStorage\":true"));
    }
}
