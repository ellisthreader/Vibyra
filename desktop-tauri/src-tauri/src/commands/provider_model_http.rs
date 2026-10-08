//! Separate from loopback-only local-model transport. Fixed TLS origins, no redirects.
use reqwest::{Client, Response};
use std::time::Duration;

pub(super) const PROVIDERS: [&str; 5] = ["openai", "openrouter", "xai", "deepseek", "mistral"];
pub(super) fn endpoint(provider: &str) -> Result<&'static str, String> {
    match provider {
        "openai" => Ok("https://api.openai.com/v1"),
        "openrouter" => Ok("https://openrouter.ai/api/v1"),
        "xai" => Ok("https://api.x.ai/v1"),
        "deepseek" => Ok("https://api.deepseek.com/v1"),
        "mistral" => Ok("https://api.mistral.ai/v1"),
        _ => Err("Choose a supported AI provider.".into()),
    }
}
pub(super) fn validate_key(key: &str) -> Result<&str, String> {
    let key = key.trim();
    if key.len() < 8 || key.len() > 16384 || key.chars().any(char::is_whitespace) {
        Err("Paste the full provider key, with no spaces.".into())
    } else {
        Ok(key)
    }
}
pub(super) fn validate_model(model: &str) -> Result<&str, String> {
    let model = model.trim();
    if model.is_empty() || model.len() > 256 || model.chars().any(char::is_control) {
        Err("Choose or enter a valid model ID.".into())
    } else {
        Ok(model)
    }
}
fn client() -> Result<Client, String> {
    Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(180))
        .build()
        .map_err(|_| "Could not start the provider connection.".into())
}
async fn checked(response: Result<Response, reqwest::Error>) -> Result<Response, String> {
    let response = response.map_err(|_| "Could not reach your AI provider.".to_string())?;
    if response.status().is_success() {
        return Ok(response);
    }
    // No echoed response body or error URL: providers can reflect submitted credentials.
    Err(match response.status().as_u16() {
        401 | 403 => "Your provider did not accept the key.".into(),
        429 => "Your provider is rate limiting this key. Try again later.".into(),
        status => format!("Your provider answered HTTP {status}. Check its model ID and account."),
    })
}
pub(super) async fn models(provider: &str, key: &str) -> Result<Vec<String>, String> {
    let mut response = checked(
        client()?
            .get(format!("{}/models", endpoint(provider)?))
            .bearer_auth(validate_key(key)?)
            .send()
            .await,
    )
    .await?;
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Could not read the provider’s models.")?
    {
        if bytes.len() + chunk.len() > 2 * 1024 * 1024 {
            return Err("The provider’s model list is too large.".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    let body: serde_json::Value = serde_json::from_slice(&bytes)
        .map_err(|_| "The provider sent an unreadable model list.")?;
    let data = body["data"]
        .as_array()
        .ok_or("This provider does not list models. Enter the model ID manually.")?;
    let mut models: Vec<String> = data
        .iter()
        .filter_map(|item| item["id"].as_str())
        .filter(|id| validate_model(id).is_ok())
        .map(str::to_owned)
        .collect();
    models.sort();
    models.dedup();
    Ok(models)
}
pub(super) async fn chat(
    provider: &str,
    key: &str,
    body: serde_json::Value,
) -> Result<Response, String> {
    checked(
        client()?
            .post(format!("{}/chat/completions", endpoint(provider)?))
            .bearer_auth(validate_key(key)?)
            .json(&body)
            .send()
            .await,
    )
    .await
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn endpoints_cannot_be_overridden_or_redirected_by_provider_input() {
        for provider in PROVIDERS {
            assert!(endpoint(provider).unwrap().starts_with("https://"));
        }
        for value in ["https://evil.example", "../openai", "openai?key=x", ""] {
            assert!(endpoint(value).is_err());
        }
    }
    #[test]
    fn invalid_credentials_and_models_never_reach_transport() {
        assert!(validate_key("short").is_err());
        assert!(validate_key("12345678\nAuthorization: Bearer another").is_err());
        assert!(validate_model("").is_err());
        assert!(validate_model("x\ny").is_err());
        assert_eq!(validate_model(" model ").unwrap(), "model");
    }
}
