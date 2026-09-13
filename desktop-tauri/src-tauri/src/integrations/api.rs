use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Duration;

#[derive(Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum Operation {
    List,
    Start,
    Poll,
    Cancel,
    Grant,
    Disconnect,
    Check,
    Read,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Request {
    pub operation: Operation,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub service: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shop: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
}

pub async fn call(token: &str, agent: &str, request: &Request) -> Result<Value, String> {
    let mut body = serde_json::to_value(request).map_err(|_| "Invalid integration request.")?;
    let device = tauri::async_runtime::spawn_blocking(crate::account_device::installation_id)
        .await
        .map_err(|_| "Could not identify this Vibyra installation.")?;
    body["device"] = json!(device);
    body["agent"] = json!(agent);
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(90))
        .connect_timeout(Duration::from_secs(10))
        .build()
        .map_err(|_| "Could not start the integration client.")?;
    let mut response = client
        .post(format!(
            "{}/api/integrations/rpc",
            crate::account_api::base_url()
        ))
        .bearer_auth(token)
        .header("Accept", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|_| "Could not reach integrations. Check your connection and try again.")?;
    let status = response.status();
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "The integration response was interrupted.")?
    {
        if bytes.len() + chunk.len() > 256 * 1024 {
            return Err("The integration returned too much data.".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    let value: Value = serde_json::from_slice(&bytes)
        .map_err(|_| "The integration service is not available in this server version.")?;
    if !status.is_success() {
        return Err(if status.as_u16() == 404 {
            "This integration is unavailable or has been removed.".into()
        } else {
            value["error"]
                .as_str()
                .unwrap_or("The integration request failed. Please try again.")
                .to_owned()
        });
    }
    Ok(value)
}

pub fn trusted_authorization(service: &str, raw: &str, shop: Option<&str>) -> bool {
    let Ok(url) = reqwest::Url::parse(raw) else {
        return false;
    };
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
        || url.fragment().is_some()
    {
        return false;
    }
    let expected = match service {
        "gmail" | "google-calendar" | "google-drive" => {
            ("accounts.google.com", "/o/oauth2/v2/auth")
        }
        "outlook" | "microsoft-calendar" | "onedrive" => {
            ("login.microsoftonline.com", "/common/oauth2/v2.0/authorize")
        }
        "stripe" => ("marketplace.stripe.com", "/oauth/v2/authorize"),
        "github" => ("github.com", "/login/oauth/authorize"),
        "shopify" => (shop.unwrap_or(""), "/admin/oauth/authorize"),
        _ => return false,
    };
    let valid_shop = service != "shopify"
        || (expected.0.ends_with(".myshopify.com")
            && expected.0.len() > 14
            && expected
                .0
                .bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-' || b == b'.'));
    valid_shop && url.host_str() == Some(expected.0) && url.path() == expected.1
}
