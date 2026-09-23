use std::time::Duration;

use reqwest::multipart::{Form, Part};
use serde_json::Value;

use crate::discord::Attachment;
use crate::report::Report;

fn file_part(file: Attachment) -> Result<Part, String> {
    Part::bytes(file.bytes)
        .file_name(file.file_name)
        .mime_str(file.mime)
        .map_err(|_| "Vibyra could not prepare an attachment".into())
}

pub async fn deliver(
    token: &str,
    report: &Report,
    screenshot: Option<Vec<u8>>,
    images: Vec<Attachment>,
    terminal_tail: Option<String>,
) -> Result<String, String> {
    let mut metadata = report.clone();
    metadata.screenshot = None;
    metadata.image_paths.clear();
    metadata.session_id = None;
    let json =
        serde_json::to_string(&metadata).map_err(|_| "Vibyra could not prepare this report")?;
    let mut form = Form::new()
        .text("report", json)
        .text("terminalTail", terminal_tail.unwrap_or_default());
    if let Some(bytes) = screenshot {
        form = form.part(
            "screenshot",
            file_part(Attachment {
                file_name: "screenshot.png".into(),
                mime: "image/png",
                bytes,
            })?,
        );
    }
    for image in images {
        form = form.part("images[]", file_part(image)?);
    }
    let url = format!("{}/api/reports", crate::account_api::base_url());
    let response = crate::http_client::shared()
        .post(url)
        .bearer_auth(token)
        .header("Accept", "application/json")
        .multipart(form)
        .timeout(Duration::from_secs(35))
        .send()
        .await
        .map_err(|error| {
            if error.is_timeout() {
                "The report timed out. Check Discord before retrying to avoid a duplicate."
                    .to_string()
            } else {
                "The report could not reach Vibyra. Check your connection before retrying."
                    .to_string()
            }
        })?;
    let status = response.status();
    let body: Value = response.json().await.unwrap_or(Value::Null);
    if !status.is_success() {
        return Err(body
            .get("error")
            .and_then(Value::as_str)
            .unwrap_or("Vibyra could not deliver this report. Try again shortly.")
            .to_owned());
    }
    body.get("id")
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| {
            "The report was sent but its reference was lost. Do not resend before checking Discord."
                .into()
        })
}
