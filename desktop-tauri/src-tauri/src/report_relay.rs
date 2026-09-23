//! Authenticated report delivery through the already deployed account service.

use std::time::Duration;

use reqwest::multipart::{Form, Part};
use serde_json::{json, Value};

use crate::account_api::{self, Endpoint};
use crate::discord::Attachment;
use crate::report::Report;

pub async fn ready(token: &str) -> Result<bool, String> {
    ready_at(&account_api::base_url(), token).await
}

async fn ready_at(base: &str, token: &str) -> Result<bool, String> {
    let path = Endpoint::ReportReady.path().expect("fixed report path");
    let response = reqwest::Client::new()
        .get(format!("{base}{path}"))
        .bearer_auth(token)
        .header("Accept", "application/json")
        .timeout(Duration::from_secs(12))
        .send()
        .await
        .map_err(|_| "Could not check reporting right now.".to_string())?;
    if !response.status().is_success() {
        return Err("Could not check reporting right now.".into());
    }
    response
        .json::<Value>()
        .await
        .ok()
        .and_then(|body| body.get("ready").and_then(Value::as_bool))
        .ok_or_else(|| "Could not check reporting right now.".into())
}

pub async fn deliver(
    token: &str,
    report: &Report,
    screenshot: Option<Vec<u8>>,
    images: Vec<Attachment>,
    tail: Option<String>,
) -> Result<String, String> {
    deliver_at(
        &account_api::base_url(),
        token,
        report,
        screenshot,
        images,
        tail,
    )
    .await
}

async fn deliver_at(
    base: &str,
    token: &str,
    report: &Report,
    screenshot: Option<Vec<u8>>,
    images: Vec<Attachment>,
    tail: Option<String>,
) -> Result<String, String> {
    // Local paths, the screenshot data URL and session id never enter JSON.
    let mut form = Form::new().text("report", metadata(report).to_string());
    if let Some(tail) = tail {
        form = form.text("terminalTail", tail);
    }
    if let Some(bytes) = screenshot {
        form = form.part(
            "screenshot",
            Part::bytes(bytes)
                .file_name("screenshot.png")
                .mime_str("image/png")
                .map_err(|_| "Invalid screenshot type")?,
        );
    }
    for image in images {
        form = form.part(
            "images[]",
            Part::bytes(image.bytes)
                .file_name(image.file_name)
                .mime_str(image.mime)
                .map_err(|_| "Invalid image type")?,
        );
    }
    let response = reqwest::Client::new()
        .post(format!("{base}/api/reports"))
        .bearer_auth(token)
        .header("Accept", "application/json")
        .timeout(Duration::from_secs(45))
        .multipart(form)
        .send()
        .await
        .map_err(|error| {
            if error.is_timeout() {
                "The report timed out. Check before retrying to avoid a duplicate.".to_string()
            } else {
                "The report could not reach Vibyra. Check your connection before retrying."
                    .to_string()
            }
        })?;
    let status = response.status().as_u16();
    let value = response.json::<Value>().await.unwrap_or_default();
    if status == 200 {
        return value
            .get("id")
            .and_then(Value::as_str)
            .map(str::to_owned)
            .ok_or_else(|| {
                "The report was sent but its reference was lost. Do not resend before checking."
                    .to_string()
            });
    }
    Err(account_api::error_detail(&value, status))
}

pub(crate) fn metadata(report: &Report) -> Value {
    json!({
        "kind": report.kind,
        "severity": report.severity,
        "summary": report.summary,
        "details": report.details,
        "error": report.error,
        "steps": report.steps,
        "expected": report.expected,
        "area": report.area,
        "contact": report.contact,
        "context": report.context,
        "includeDiagnostics": report.include_diagnostics,
    })
}

#[cfg(test)]
#[path = "report_relay_tests.rs"]
mod tests;
