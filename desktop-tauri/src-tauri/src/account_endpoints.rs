use crate::account_api::ApiError;

/// The only account API paths this client can reach. The renderer never
/// supplies URLs or methods; commands pick a variant, and the two variants
/// that carry an identifier validate its shape before it reaches a path.
pub enum Endpoint<'a> {
    Signup,
    Login,
    /// The second half of a password login: a challenge id and a code.
    LoginTwoFactor,
    Session,
    Rotate,
    Logout,
    Profile,
    PasswordForgot,
    EmailResend,
    /// Whether a second factor is on, and whether this account may have one.
    TwoFactorStatus,
    TwoFactorStart,
    TwoFactorConfirm,
    TwoFactorRecovery,
    TwoFactorDisable,
    /// Every device this account is signed in on.
    AccountSessions,
    /// Signs out one device, named by the backend's opaque device id.
    RevokeDevice(&'a str),
    /// Signs out every device, this one included.
    RevokeSessions,
    DeleteAccount,
    BillingPortal,
    BillingCheckout,
    BillingPlans,
    /// The versioned Vibes wallet: the account's AI balance.
    VibesWallet,
    /// Registers this computer for remote access and takes a relay token.
    RemoteRegister,
    HostNotificationCredential,
    HostNotificationEvents,
    OauthStart(&'a str),
    OauthStatus(&'a str, &'a str),
}

impl Endpoint<'_> {
    pub(crate) fn path(&self) -> Result<String, ApiError> {
        let invalid = || ApiError::Rejected("Unsupported sign-in provider.".into());
        match self {
            Endpoint::Signup => Ok("/api/auth/signup".into()),
            Endpoint::Login => Ok("/api/auth/login".into()),
            Endpoint::LoginTwoFactor => Ok("/api/auth/login/2fa".into()),
            Endpoint::Session => Ok("/api/session".into()),
            Endpoint::Rotate => Ok("/api/auth/session/rotate".into()),
            Endpoint::Logout => Ok("/api/auth/logout".into()),
            Endpoint::Profile => Ok("/api/account/profile".into()),
            Endpoint::PasswordForgot => Ok("/api/auth/password/forgot".into()),
            Endpoint::EmailResend => Ok("/api/auth/email/resend".into()),
            Endpoint::TwoFactorStatus | Endpoint::TwoFactorDisable => Ok("/api/account/2fa".into()),
            Endpoint::TwoFactorStart => Ok("/api/account/2fa/start".into()),
            Endpoint::TwoFactorConfirm => Ok("/api/account/2fa/confirm".into()),
            Endpoint::TwoFactorRecovery => Ok("/api/account/2fa/recovery".into()),
            Endpoint::AccountSessions | Endpoint::RevokeSessions => {
                Ok("/api/account/sessions".into())
            }
            Endpoint::DeleteAccount => Ok("/api/account".into()),
            Endpoint::BillingPortal => Ok("/api/billing/portal".into()),
            Endpoint::BillingCheckout => Ok("/api/billing/checkout".into()),
            Endpoint::BillingPlans => Ok("/api/billing/plans".into()),
            Endpoint::VibesWallet => Ok("/api/vibes/wallet".into()),
            Endpoint::RemoteRegister => Ok("/api/remote/hosts".into()),
            Endpoint::HostNotificationCredential => {
                Ok("/api/notifications/v1/host-credential".into())
            }
            Endpoint::HostNotificationEvents => Ok("/api/notifications/v1/host-events".into()),
            Endpoint::RevokeDevice(device) => {
                // The backend's device id is a SHA-256 hex digest. Checking the
                // shape here is what stops any other string reaching a path.
                let ok = device.len() == 64 && device.chars().all(|c| c.is_ascii_hexdigit());
                if !ok {
                    return Err(ApiError::Rejected("Unknown device.".into()));
                }
                Ok(format!("/api/account/devices/{device}"))
            }
            Endpoint::OauthStart(provider) => {
                let provider = valid_provider(provider).ok_or_else(invalid)?;
                Ok(format!("/api/auth/desktop/{provider}/start"))
            }
            Endpoint::OauthStatus(provider, flow) => {
                let provider = valid_provider(provider).ok_or_else(invalid)?;
                let flow_ok = (40..=100).contains(&flow.len())
                    && flow.chars().all(|c| c.is_ascii_alphanumeric());
                if !flow_ok {
                    return Err(ApiError::Rejected("Invalid sign-in attempt.".into()));
                }
                Ok(format!("/api/auth/desktop/{provider}/status/{flow}"))
            }
        }
    }

    pub(crate) fn method(&self) -> reqwest::Method {
        match self {
            Endpoint::Session
            | Endpoint::OauthStatus(..)
            | Endpoint::TwoFactorStatus
            | Endpoint::AccountSessions
            | Endpoint::BillingPlans
            | Endpoint::VibesWallet => reqwest::Method::GET,
            Endpoint::Logout
            | Endpoint::TwoFactorDisable
            | Endpoint::RevokeDevice(_)
            | Endpoint::RevokeSessions
            | Endpoint::DeleteAccount => reqwest::Method::DELETE,
            _ => reqwest::Method::POST,
        }
    }
}

fn valid_provider(provider: &str) -> Option<&'static str> {
    match provider {
        "google" => Some("google"),
        "apple" => Some("apple"),
        _ => None,
    }
}
