//! Shared Discord webhook plumbing.
//!
//! Two senders sit on top of this: model-release announcements
//! (`model_watch_discord`) and user reports (`report`). Both need the same two
//! things — proof a URL really is a Discord webhook before anything is sent to
//! it, and a POST whose failures come back in words the person who typed the
//! URL can act on.

use std::time::Duration;

use serde_json::Value;

const TIMEOUT: Duration = Duration::from_secs(20);

/// Discord's own ceiling for an unboosted server. Enforced here as well so an
/// oversized attachment is caught before it is uploaded rather than after.
pub(crate) const MAX_ATTACHMENT_BYTES: usize = 8 * 1024 * 1024;

/// Rejects anything that is not an HTTPS Discord webhook endpoint.
///
/// The host test is an exact match (plus Discord's own subdomains), never a
/// `contains` or a bare suffix: `discord.com.example.net` would satisfy both
/// of those and would then receive whatever Vibyra posts next.
pub(crate) fn validate_webhook(value: &str) -> Result<String, String> {
    let value = value.trim();
    let parsed =
        reqwest::Url::parse(value).map_err(|_| "Discord webhook URL is invalid".to_string())?;
    let host = parsed.host_str().unwrap_or_default();
    let discord_host =
        host == "discord.com" || host == "discordapp.com" || host.ends_with(".discord.com");
    let path = parsed
        .path()
        .trim_matches('/')
        .split('/')
        .collect::<Vec<_>>();
    if parsed.scheme() != "https"
        || !discord_host
        || path.len() < 4
        || path[0] != "api"
        || path[1] != "webhooks"
        || path[2].is_empty()
        || path[3].is_empty()
    {
        return Err("Use a Discord HTTPS webhook URL from Server Settings > Integrations".into());
    }
    Ok(value.to_owned())
}

/// A file riding along with the message. Discord references it from the embed
/// by `attachment://{file_name}`, so the name is part of the contract.
#[derive(Debug)]
pub(crate) struct Attachment {
    pub file_name: String,
    pub mime: &'static str,
    pub bytes: Vec<u8>,
}

/// Turns Discord's status codes into something actionable. A report that fails
/// is shown to the user who wrote it, so "HTTP 404" alone would strand them.
fn status_message(status: u16) -> String {
    let explanation = match status {
        401 | 403 => "Discord rejected the webhook — it may have been revoked",
        404 => "That Discord webhook no longer exists — recreate it in Server Settings",
        413 => "Discord refused the attachment as too large",
        429 => "Discord is rate limiting this webhook — try again shortly",
        _ => "Discord rejected the message",
    };
    // The code always rides along with the explanation. The words are for the
    // person who has to fix it; the number is for whoever reads the report of
    // them trying, and dropping it cost a passing test its meaning.
    format!("{explanation} (HTTP {status})")
}

/// Posts `body`, carrying `files` as multipart when there are any.
///
/// Discord accepts a plain JSON body only when nothing is attached; the moment
/// a file rides along the whole message has to become multipart with the embed
/// moved into a `payload_json` part.
pub(crate) async fn post(
    webhook: &str,
    body: &Value,
    files: Vec<Attachment>,
) -> Result<(), String> {
    let client = reqwest::Client::new();
    let request = if files.is_empty() {
        client.post(webhook).json(body)
    } else {
        let payload = serde_json::to_string(body)
            .map_err(|_| "Vibyra built an invalid message".to_string())?;
        let mut form = reqwest::multipart::Form::new().text("payload_json", payload);
        for (index, file) in files.into_iter().enumerate() {
            if file.bytes.len() > MAX_ATTACHMENT_BYTES {
                return Err("The attachment is too large for Discord".into());
            }
            let part = reqwest::multipart::Part::bytes(file.bytes)
                .file_name(file.file_name)
                .mime_str(file.mime)
                .map_err(|_| "Vibyra built an invalid attachment".to_string())?;
            form = form.part(format!("files[{index}]"), part);
        }
        client.post(webhook).multipart(form)
    };
    let response = request.timeout(TIMEOUT).send().await.map_err(|error| {
        if error.is_timeout() {
            "Discord did not answer in time".to_string()
        } else {
            "Discord could not be reached — check your connection".to_string()
        }
    })?;
    if !response.status().is_success() {
        return Err(status_message(response.status().as_u16()));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{status_message, validate_webhook};

    #[test]
    fn validates_only_discord_webhook_urls() {
        assert!(validate_webhook("https://discord.com/api/webhooks/123/token").is_ok());
        assert!(validate_webhook("https://discord.com.example/api/webhooks/123/token").is_err());
        assert!(validate_webhook("http://discord.com/api/webhooks/123/token").is_err());
        assert!(validate_webhook("https://discord.com/api/webhooks/123").is_err());
    }

    #[test]
    fn a_failure_is_explained_and_still_carries_its_code() {
        // Both halves are load-bearing. Replacing the code with prose broke
        // `model_watch_tests::discord_delivery_requires_a_success_status`,
        // which asserts the status survives — so both are asserted here.
        for (status, words) in [
            (401_u16, "revoked"),
            (404, "no longer exists"),
            (413, "too large"),
            (429, "rate limiting"),
        ] {
            assert!(
                status_message(status).contains(words),
                "{status} lost its explanation"
            );
            assert!(
                status_message(status).contains(&format!("HTTP {status}")),
                "{status} lost its code"
            );
        }
        assert!(status_message(500).contains("HTTP 500"));
    }
}
