use serde_json::{json, Value};

use crate::discord::{self, validate_webhook};
use crate::model_watch::ReleasedModel;
use crate::secret_store::SecretStore;

const MAX_LISTED: usize = 10;

pub(crate) fn configured_webhook() -> Result<Option<String>, String> {
    if let Ok(value) = std::env::var("VIBYRA_DISCORD_WEBHOOK_URL") {
        if !value.trim().is_empty() {
            return validate_webhook(&value).map(Some);
        }
    }
    SecretStore
        .read_discord_model_webhook()?
        .map(|value| validate_webhook(&value))
        .transpose()
}

pub(crate) async fn notify_models(webhook: &str, models: &[ReleasedModel]) -> Result<(), String> {
    let title = if models.len() == 1 {
        "New AI model released".to_string()
    } else {
        format!("{} new AI models released", models.len())
    };
    let mut lines = models
        .iter()
        .take(MAX_LISTED)
        .map(|model| format!("**{}** — `{}`", model.name, model.id))
        .collect::<Vec<_>>();
    if models.len() > MAX_LISTED {
        lines.push(format!("…and {} more", models.len() - MAX_LISTED));
    }
    post_embed(webhook, &title, &lines.join("\n")).await
}

pub(crate) async fn send_test(webhook: &str) -> Result<(), String> {
    post_embed(
        webhook,
        "Vibyra model alerts connected",
        "Discord will be notified when Vibyra detects a new supported AI model.",
    )
    .await
}

fn embed_body(title: &str, description: &str) -> Value {
    json!({
        "embeds": [{
            "title": title,
            "description": description,
            "color": 0x005b_7cfa
        }]
    })
}

async fn post_embed(webhook: &str, title: &str, description: &str) -> Result<(), String> {
    discord::post(webhook, &embed_body(title, description), Vec::new()).await
}

#[cfg(test)]
mod tests {
    use super::embed_body;

    #[test]
    fn embed_body_contains_no_webhook_value() {
        let body = embed_body("Title", "Description").to_string();
        assert!(body.contains("Title"));
        assert!(body.contains("Description"));
        assert!(!body.contains("webhook"));
    }
}
