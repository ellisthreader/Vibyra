use crate::account_api::ApiError;

/// The only account API paths this client can reach. The renderer never
/// supplies URLs or methods; commands pick a variant, and the two variants
/// that carry an identifier validate its shape before it reaches a path.
pub enum Endpoint<'a> {
    CloudComputer,
    CloudComputerWake,
    CloudComputerConnectMac,
    CloudComputerAccess,
    CloudComputerStop,
    CloudComputerDisconnect,
    CloudComputerRepair,
    CloudComputerProjects,
    CloudComputerProvider(&'a str),
    Signup,
    Login,
    /// The second half of a password login: a challenge id and a code.
    LoginTwoFactor,
    LoginTwoFactorCode,
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
    TwoFactorCode,
    TwoFactorMethodStart,
    TwoFactorMethodConfirm,
    TwoFactorMethodCode,
    /// Every device this account is signed in on.
    AccountSessions,
    /// Signs out one device, named by the backend's opaque device id.
    RevokeDevice(&'a str),
    /// Signs out every device, this one included.
    RevokeSessions,
    DeleteAccount,
    RedeemLicense,
    LicenseWelcome,
    BillingPortal,
    BillingCheckout,
    BillingCatalogue,
    /// The versioned Vibes wallet: the account's AI balance.
    VibesWallet,
    SpendCaps,
    SpendCapsSet,
    SpendCapsRaise,
    AccountActivity(u64),
    AccountExport,
    AccountExportRequest,
    AccountRetention,
    AccountRetentionSet,
    RemoteRegister,
    RemoteHosts,
    RemoteChallenge,
    HostNotificationCredential,
    HostNotificationEvents,
    ReportReady,
    OauthStart(&'a str),
    OauthStatus(&'a str, &'a str),
}

impl Endpoint<'_> {
    pub(crate) fn path(&self) -> Result<String, ApiError> {
        let invalid = || ApiError::Rejected("Unsupported sign-in provider.".into());
        match self {
            Endpoint::CloudComputer => Ok("/api/cloud-computer".into()),
            Endpoint::CloudComputerWake => Ok("/api/cloud-computer/wake".into()),
            Endpoint::CloudComputerConnectMac => Ok("/api/cloud-computer/connect/mac".into()),
            Endpoint::CloudComputerAccess => Ok("/api/cloud-computer/access".into()),
            Endpoint::CloudComputerStop => Ok("/api/cloud-computer/stop".into()),
            Endpoint::CloudComputerDisconnect => Ok("/api/cloud-computer/connect".into()),
            Endpoint::CloudComputerRepair => Ok("/api/cloud-computer/sync/repair".into()),
            Endpoint::CloudComputerProjects => Ok("/api/cloud-computer/access/projects".into()),
            Endpoint::CloudComputerProvider("github") => {
                Ok("/api/cloud-computer/access/integrations/github".into())
            }
            Endpoint::CloudComputerProvider(provider @ ("claude" | "codex")) => {
                Ok(format!("/api/cloud-computer/access/providers/{provider}"))
            }
            Endpoint::CloudComputerProvider(_) => Err(ApiError::Rejected(
                "Choose a supported Cloud account.".into(),
            )),
            Endpoint::Signup => Ok("/api/auth/signup".into()),
            Endpoint::Login => Ok("/api/auth/login".into()),
            Endpoint::LoginTwoFactor => Ok("/api/auth/login/2fa".into()),
            Endpoint::LoginTwoFactorCode => Ok("/api/auth/login/2fa/code".into()),
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
            Endpoint::TwoFactorCode => Ok("/api/account/2fa/code".into()),
            Endpoint::TwoFactorMethodStart => Ok("/api/account/2fa/method/start".into()),
            Endpoint::TwoFactorMethodCode => Ok("/api/account/2fa/method/code".into()),
            Endpoint::TwoFactorMethodConfirm => Ok("/api/account/2fa/method/confirm".into()),
            Endpoint::AccountSessions | Endpoint::RevokeSessions => {
                Ok("/api/account/sessions".into())
            }
            Endpoint::DeleteAccount => Ok("/api/account".into()),
            Endpoint::RedeemLicense => Ok("/api/account/license".into()),
            Endpoint::LicenseWelcome => Ok("/api/account/license/welcome".into()),
            Endpoint::BillingPortal => Ok("/api/billing/portal".into()),
            Endpoint::BillingCheckout => Ok("/api/billing/checkout".into()),
            Endpoint::BillingCatalogue => Ok("/api/billing/catalogue".into()),
            Endpoint::AccountActivity(0) => Ok("/api/account/activity?limit=30".into()),
            Endpoint::AccountActivity(before) => {
                Ok(format!("/api/account/activity?limit=30&before={before}"))
            }
            Endpoint::AccountExport | Endpoint::AccountExportRequest => {
                Ok("/api/account/export".into())
            }
            Endpoint::AccountRetention | Endpoint::AccountRetentionSet => {
                Ok("/api/account/retention".into())
            }
            Endpoint::SpendCaps | Endpoint::SpendCapsSet => Ok("/api/spend-caps".into()),
            Endpoint::SpendCapsRaise => Ok("/api/spend-caps/raise".into()),
            Endpoint::VibesWallet => Ok("/api/vibes/wallet".into()),
            Endpoint::HostNotificationCredential => {
                Ok("/api/notifications/v1/host-credential".into())
            }
            Endpoint::HostNotificationEvents => Ok("/api/notifications/v1/host-events".into()),
            Endpoint::ReportReady => Ok("/api/reports/ready".into()),
            Endpoint::RemoteHosts => Ok("/api/remote/hosts".into()),
            Endpoint::RemoteRegister => Ok("/api/remote/hosts".into()),
            Endpoint::RemoteChallenge => Ok("/api/remote/hosts/challenge".into()),
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
            Endpoint::CloudComputer
            | Endpoint::RemoteHosts
            | Endpoint::CloudComputerAccess
            | Endpoint::Session
            | Endpoint::OauthStatus(..)
            | Endpoint::TwoFactorStatus
            | Endpoint::AccountSessions
            | Endpoint::BillingCatalogue
            | Endpoint::VibesWallet
            | Endpoint::SpendCaps
            | Endpoint::AccountActivity(_)
            | Endpoint::AccountExport
            | Endpoint::AccountRetention
            | Endpoint::ReportReady => reqwest::Method::GET,
            Endpoint::Logout
            | Endpoint::CloudComputerDisconnect
            | Endpoint::TwoFactorDisable
            | Endpoint::RevokeDevice(_)
            | Endpoint::RevokeSessions
            | Endpoint::DeleteAccount => reqwest::Method::DELETE,
            Endpoint::AccountRetentionSet
            | Endpoint::CloudComputerProjects
            | Endpoint::CloudComputerProvider(_) => reqwest::Method::PUT,
            Endpoint::SpendCapsSet => reqwest::Method::PATCH,
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
