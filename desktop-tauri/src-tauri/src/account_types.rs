use serde::Serialize;

/// Renderer-safe account states. The bearer token never leaves native code;
/// the renderer only ever sees these coarse states plus display fields.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum AccountStatus {
    Restoring,
    SignedOut,
    Authorizing,
    /// A password was right, and the account asks for a code as well. The
    /// challenge itself stays native; the renderer only knows to ask.
    TwoFactor,
    SignedIn,
    ConnectionError,
}

impl AccountStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            AccountStatus::Restoring => "restoring",
            AccountStatus::SignedOut => "signedOut",
            AccountStatus::Authorizing => "authorizing",
            AccountStatus::TwoFactor => "twoFactor",
            AccountStatus::SignedIn => "signedIn",
            AccountStatus::ConnectionError => "connectionError",
        }
    }
}

/// Display-only profile details: who is signed in, and the membership facts
/// the Account page states. Deliberately excludes ids, tokens, customer
/// records, and the credit counters — the balance comes from the wallet.
#[derive(Clone, Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct AccountProfile {
    pub name: String,
    pub email: String,
    pub provider: String,
    pub plan: String,
    pub email_verified: bool,
    /// Opaque stable scope for renderer-only, per-account welcome state.
    pub welcome_key: String,
    pub two_factor_enabled: bool,
    pub created_at: Option<String>,
    /// `monthly` or `annual`; an App Store membership is always monthly.
    pub plan_billing_cycle: String,
    pub plan_renews_at: Option<String>,
    pub credits_reset_at: Option<String>,
    /// The paid-through date, which is what a cancellation runs to.
    pub membership_ends_at: Option<String>,
    pub membership_cancel_at_period_end: bool,
    /// `stripe`, `iap-apple`, `iap-google`, or absent on a free account.
    pub billing_provider: Option<String>,
    pub can_manage_stripe_billing: bool,
    /// Whether this account has a photo. Where it is stays native: the
    /// renderer has no network reach, so the bytes are fetched for it.
    pub has_avatar: bool,
    #[serde(skip)]
    pub avatar_url: Option<String>,
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

/// Extracts the safe display profile from a backend `user` payload. Fields an
/// older server leaves out stay absent rather than becoming a wrong default.
pub fn profile_from_user(user: &serde_json::Value) -> Option<AccountProfile> {
    let email = user.get("email")?.as_str()?.trim().to_owned();
    if email.is_empty() {
        return None;
    }
    let text =
        |key: &str, fallback: &str| optional_text(user, key).unwrap_or_else(|| fallback.to_owned());
    let flag = |key: &str| user.get(key).and_then(|v| v.as_bool()).unwrap_or(false);
    let cycle = text("planBillingCycle", "monthly");
    let avatar_url = optional_text(user, "avatarUrl");
    Some(AccountProfile {
        name: text("name", ""),
        email,
        provider: text("provider", "email"),
        plan: text("plan", "free"),
        email_verified: flag("emailVerified"),
        welcome_key: welcome_key(user),
        two_factor_enabled: flag("twoFactorEnabled"),
        created_at: optional_text(user, "createdAt"),
        plan_billing_cycle: if cycle == "annual" {
            cycle
        } else {
            "monthly".to_owned()
        },
        plan_renews_at: optional_text(user, "planRenewsAt"),
        credits_reset_at: optional_text(user, "creditsResetAt"),
        membership_ends_at: optional_text(user, "membershipEndsAt"),
        membership_cancel_at_period_end: flag("membershipCancelAtPeriodEnd"),
        billing_provider: optional_text(user, "billingProvider"),
        can_manage_stripe_billing: flag("canManageStripeBilling"),
        has_avatar: avatar_url.is_some(),
        avatar_url,
    })
}

/// Native-only Preview scope from a verified account response. An older API
/// response without a stable user ID can still sign in, but cannot share a
/// local site until the identity is known.
pub fn verified_preview_account_id(user: &serde_json::Value) -> Option<String> {
    let id = user.get("id")?;
    let id = id
        .as_str()
        .map(str::to_owned)
        .or_else(|| id.as_i64().map(|number| number.to_string()))
        .or_else(|| id.as_u64().map(|number| number.to_string()))?;
    if id.is_empty() || id.len() > 256 || id.chars().any(char::is_control) {
        return None;
    }
    Some(format!("user:{id}"))
}

fn optional_text(user: &serde_json::Value, key: &str) -> Option<String> {
    user.get(key)
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_owned)
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
mod preview_account_tests {
    use super::verified_preview_account_id;
    use serde_json::json;

    #[test]
    fn preview_requires_a_stable_verified_user_id() {
        assert_eq!(
            verified_preview_account_id(&json!({"id":"alpha","email":"a@b.test"})).as_deref(),
            Some("user:alpha")
        );
        assert_eq!(
            verified_preview_account_id(&json!({"id":42})).as_deref(),
            Some("user:42")
        );
        assert!(verified_preview_account_id(&json!({"email":"a@b.test"})).is_none());
        assert!(verified_preview_account_id(&json!({"id":"bad\nidentity"})).is_none());
    }
}
