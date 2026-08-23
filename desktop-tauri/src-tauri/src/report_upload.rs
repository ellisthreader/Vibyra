use std::time::Duration;

use reqwest::multipart::{Form, Part};
use serde_json::json;

use crate::account_api::{base_url, error_detail};
use crate::discord::Attachment;
use crate::report::Report;

const TIMEOUT: Duration = Duration::from_secs(30);

pub async fn deliver(
    token: &str,
    report: &Report,
    screenshot: Option<Vec<u8>>,
    images: Vec<Attachment>,
    terminal_tail: Option<&str>,
) -> Result<String, String> {
    let report_json = wire_report(report, terminal_tail)?;
    let mut form = Form::new().text("report", report_json);
    if let Some(bytes) = screenshot {
        form = form.part(
            "screenshot",
            Part::bytes(bytes)
                .file_name("screenshot.png")
                .mime_str("image/png")
                .map_err(|_| "Vibyra built an invalid screenshot".to_string())?,
        );
    }
    for image in images {
        let part = Part::bytes(image.bytes)
            .file_name(image.file_name)
            .mime_str(image.mime)
            .map_err(|_| "Vibyra built an invalid image attachment".to_string())?;
        form = form.part("images[]", part);
    }
    let response = reqwest::Client::new()
        .post(format!("{}/api/reports", base_url()))
        .bearer_auth(token)
        .header("Accept", "application/json")
        .multipart(form)
        .timeout(TIMEOUT)
        .send()
        .await
        .map_err(|error| {
            if error.is_timeout() {
                "Reporting took too long to answer. Try again.".to_string()
            } else {
                "Vibyra could not reach reporting. Check your connection and try again.".to_string()
            }
        })?;
    let status = response.status().as_u16();
    let value = response
        .json::<serde_json::Value>()
        .await
        .unwrap_or(serde_json::Value::Null);
    if !(200..300).contains(&status) {
        return Err(match status {
            401 | 403 => "Your session expired. Sign in again, then resend the report.".into(),
            413 => "The report attachments are too large to upload.".into(),
            429 => "Too many reports were sent recently. Wait a moment and try again.".into(),
            _ => error_detail(&value, status),
        });
    }
    value
        .get("reportId")
        .and_then(|id| id.as_str())
        .filter(|id| id.starts_with("VR-") && id.len() == 9)
        .map(str::to_owned)
        .ok_or_else(|| "Reporting returned an invalid confirmation. Try again.".into())
}

fn wire_report(report: &Report, terminal_tail: Option<&str>) -> Result<String, String> {
    serde_json::to_string(&json!({
        "kind": &report.kind,
        "severity": &report.severity,
        "summary": &report.summary,
        "details": &report.details,
        "steps": &report.steps,
        "expected": &report.expected,
        "area": &report.area,
        "contact": &report.contact,
        "context": &report.context,
        "terminalTail": terminal_tail,
    }))
    .map_err(|_| "Vibyra could not prepare the report".into())
}

#[cfg(test)]
mod tests {
    use super::wire_report;
    use crate::report::{Report, ReportContext};

    #[test]
    fn wire_payload_contains_context_but_never_local_attachment_paths() {
        let report = Report {
            summary: "Preview is blank".into(),
            details: "The frame never loaded.".into(),
            image_paths: vec!["/private/evidence.png".into()],
            context: ReportContext {
                project_root: Some("/private/project".into()),
                ..ReportContext::default()
            },
            ..Report::default()
        };
        let payload = wire_report(&report, Some("last output")).unwrap();
        assert!(payload.contains("/private/project"));
        assert!(payload.contains("last output"));
        assert!(!payload.contains("/private/evidence.png"));
    }
}
