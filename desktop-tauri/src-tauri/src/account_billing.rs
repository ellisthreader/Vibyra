use serde::Serialize;

use crate::account_api::{request, ApiError, Endpoint};
use crate::state::AppState;

/// The website pages billing sends people to. The renderer names a page and
/// never a URL, exactly as it does for the legal pages.
const PLANS_PAGE: &str = "https://vibyra.app/billing";
/// Checkout opens on Annual; the page itself asks for an account first.
const PRO_CHECKOUT: &str = "https://vibyra.app/checkout?offer=pro_annual";
const APP_STORE_SUBSCRIPTIONS: &str = "https://apps.apple.com/account/subscriptions";

/// The account's AI balance, as the versioned Vibes wallet reports it. The
/// built-in assistant spends these tokens; coding terminals use the person's
/// connected provider accounts.
#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CreditsSummary {
    pub available: f64,
    /// Reserved by replies still in flight, and spent or returned on settle.
    pub held: f64,
    pub total: f64,
    /// False while AI chat is switched off for the account or the backend.
    pub chat_enabled: bool,
    pub purchases_enabled: bool,
    pub paid_available: f64,
    pub promotional_expires_at: Option<String>,
    pub free_next_at: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopupOption {
    pub key: String,
    pub credits: u64,
    pub price_pence: u64,
}

pub async fn credits(state: &AppState) -> Result<CreditsSummary, String> {
    let body = call(state, Endpoint::VibesWallet, None).await?;
    let wallet = body.get("wallet").unwrap_or(&serde_json::Value::Null);
    Ok(CreditsSummary {
        available: balance(wallet, "available")?,
        held: balance(wallet, "held")?,
        total: balance(wallet, "total")?,
        paid_available: balance(wallet, "paidAvailable")?,
        promotional_expires_at: wallet["freeAllowance"]["expiresAt"]
            .as_str()
            .map(str::to_owned),
        free_next_at: wallet["freeAllowance"]["nextAt"]
            .as_str()
            .map(str::to_owned),
        chat_enabled: flag(wallet, "chatEnabled"),
        purchases_enabled: wallet
            .get("salesCapabilities")
            .map(|sales| flag(sales, "stripe"))
            .unwrap_or(false),
    })
}

/// The top-up sizes on sale, cheapest first. Public catalogue, so a signed
/// out or cold-started backend still answers.
pub async fn topups() -> Result<Vec<TopupOption>, String> {
    match request(Endpoint::BillingCatalogue, None, None).await {
        Ok(body) => Ok(body
            .get("offers")
            .and_then(|v| v.as_array())
            .map(|rows| rows.iter().filter_map(topup).collect())
            .unwrap_or_default()),
        Err(error) => Err(error.message().to_owned()),
    }
}

/// Opens the Stripe customer portal in the system browser. The one-time URL
/// is handed straight to the browser and never crosses into the renderer.
pub async fn open_portal(state: &AppState) -> Result<(), String> {
    let body = call(state, Endpoint::BillingPortal, Some(serde_json::json!({}))).await?;
    open_returned_url(&body)
}

/// Opens Stripe Checkout for one top-up size.
pub async fn open_topup_checkout(state: &AppState, topup: String) -> Result<(), String> {
    let key = topup.trim();
    let shaped =
        (1..=40).contains(&key.len()) && key.chars().all(|c| c.is_ascii_alphanumeric() || c == '_');
    if !shaped {
        return Err("Unknown top-up.".to_owned());
    }
    let catalogue = request(Endpoint::BillingCatalogue, None, None)
        .await
        .map_err(|e| e.message().to_owned())?;
    let offer = catalogue
        .get("offers")
        .and_then(|v| v.as_array())
        .and_then(|rows| {
            rows.iter()
                .find(|o| o["offerKey"] == key && o["kind"] == "topup")
        })
        .ok_or_else(|| "This top-up is unavailable. Refresh prices.".to_owned())?;
    let body = serde_json::json!({ "offerKey": key, "offerVersion": offer["offerVersion"], "requestId": uuid::Uuid::new_v4().to_string() });
    let body = call(state, Endpoint::BillingCheckout, Some(body)).await?;
    open_returned_url(&body)
}

/// Opens one of the enumerated billing pages: the website's plans page, or
/// the subscriptions page Apple keeps for every account.
pub fn open_page(page: &str) -> Result<(), String> {
    let url = match page {
        "plans" => PLANS_PAGE,
        "pro" => PRO_CHECKOUT,
        "activity" => "https://vibyra.app/account?activity=1",
        "appStore" => APP_STORE_SUBSCRIPTIONS,
        _ => return Err("Unknown billing page.".to_owned()),
    };
    crate::provider_auth_url::open(url)
}

fn open_returned_url(body: &serde_json::Value) -> Result<(), String> {
    let url = body
        .get("url")
        .and_then(|v| v.as_str())
        .filter(|url| url.starts_with("https://"))
        .ok_or_else(|| "Billing could not be opened. Try again.".to_owned())?;
    crate::provider_auth_url::open(url)
        .map_err(|_| "Vibyra could not open your browser. Try again.".to_owned())
}

async fn call(
    state: &AppState,
    endpoint: Endpoint<'_>,
    body: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let Some(token) = state.account.token() else {
        return Err("You are not signed in.".to_owned());
    };
    match request(endpoint, Some(&token), body).await {
        Ok(value) => Ok(value),
        Err(ApiError::Unauthorized(message)) => {
            crate::account_auth::reject_session(state);
            Err(message)
        }
        Err(error) => Err(error.message().to_owned()),
    }
}

fn topup(row: &serde_json::Value) -> Option<TopupOption> {
    if row.get("kind")?.as_str()? != "topup" || !flag(row, "stripeEnabled") {
        return None;
    }
    let key = row.get("offerKey")?.as_str()?.trim().to_owned();
    let credits = number(row, "credits");
    let price_pence = number(row, "pence");
    (!key.is_empty() && credits > 0 && price_pence > 0).then_some(TopupOption {
        key,
        credits,
        price_pence,
    })
}

fn number(value: &serde_json::Value, key: &str) -> u64 {
    value.get(key).and_then(|v| v.as_u64()).unwrap_or(0)
}

fn flag(value: &serde_json::Value, key: &str) -> bool {
    value.get(key).and_then(|v| v.as_bool()).unwrap_or(false)
}

fn balance(wallet: &serde_json::Value, key: &str) -> Result<f64, String> {
    let invalid = || "Your token balance could not be verified. Please refresh.".to_owned();
    match wallet["version"].as_u64() {
        Some(1) => wallet[key].as_u64().map(|n| n as f64).ok_or_else(invalid),
        Some(2) if wallet["unitScale"].as_u64() == Some(10000) => {
            let raw = wallet[format!("{key}Units")].as_str().ok_or_else(invalid)?;
            if raw.is_empty() || !raw.bytes().all(|c| c.is_ascii_digit()) {
                return Err(invalid());
            }
            let units = raw.parse::<u64>().map_err(|_| invalid())?;
            if units > 9_007_199_254_740_991 {
                return Err(invalid());
            }
            Ok(units as f64 / 10000.0)
        }
        _ => Err(invalid()),
    }
}

#[cfg(test)]
#[path = "account_billing_tests.rs"]
mod tests;
