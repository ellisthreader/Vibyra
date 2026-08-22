//! A user-submitted report, on its way to the maintainer's Discord channel.
//!
//! The shape is deliberately wider than "what went wrong": a report that
//! cannot say *where* it happened costs a round trip to find out, and the user
//! who hit the bug is rarely still there to answer. So the frontend gathers
//! the surrounding state — version, platform, project, agent, model, the pane
//! that was in front — and shows the user exactly what it collected before
//! they send it.

use serde::Deserialize;

use crate::discord::{self, Attachment};
use crate::report_format::embed;
use crate::report_text::{context_text, CONTEXT_FILE};
use crate::secret_store::SecretStore;

/// Bounds on what one submission may carry. Generous for a person typing, far
/// below anything that would trouble Discord.
const MAX_SUMMARY: usize = 300;
const MAX_BODY: usize = 8_000;

/// Where the user was standing when they hit Report. Every field is optional
/// because a report from the Home screen has no project, and one sent before
/// any terminal is open has no agent.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ReportContext {
    pub app_version: String,
    pub platform: String,
    pub renderer: Option<String>,
    pub view: Option<String>,
    pub project: Option<String>,
    pub project_root: Option<String>,
    pub agent: Option<String>,
    pub model: Option<String>,
    pub pane: Option<String>,
    pub reporter: Option<String>,
    pub locale: Option<String>,
    pub screen: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Report {
    pub kind: String,
    pub severity: String,
    pub summary: String,
    pub details: String,
    pub steps: Option<String>,
    pub expected: Option<String>,
    pub area: Option<String>,
    pub contact: Option<String>,
    pub context: ReportContext,
    /// PNG data URL straight from the screenshot editor, if one was attached.
    pub screenshot: Option<String>,
    /// Images the reporter attached from disk or pasted. Paths rather than
    /// bytes: the webview never has to hold a picture to send one.
    pub image_paths: Vec<String>,
    /// The live pane whose output the user agreed to include, if any. Read in
    /// Rust rather than sent from the UI, so the webview never has to hold a
    /// terminal's scrollback just to describe it.
    pub session_id: Option<u64>,
}

/// Refuses a report that says nothing, and one so large it was not typed.
///
/// Checked here rather than only in the UI: the command is reachable from any
/// webview code, and a blank report costs the maintainer a triage slot.
pub fn validate(report: &Report) -> Result<(), String> {
    if report.summary.trim().is_empty() {
        return Err("Add a one-line summary so the report can be triaged".into());
    }
    if report.details.trim().is_empty() {
        return Err("Describe what happened so the report can be acted on".into());
    }
    if report.summary.chars().count() > MAX_SUMMARY {
        return Err("The summary is too long — keep it to one line".into());
    }
    if report.details.chars().count() > MAX_BODY
        || report
            .steps
            .as_ref()
            .is_some_and(|v| v.chars().count() > MAX_BODY)
        || report
            .expected
            .as_ref()
            .is_some_and(|v| v.chars().count() > MAX_BODY)
    {
        return Err("That is more text than one report can carry".into());
    }
    Ok(())
}

/// The report channel, from the environment first so a development build can
/// be pointed somewhere harmless without touching the stored one.
pub fn configured_webhook() -> Result<Option<String>, String> {
    if let Ok(value) = std::env::var("VIBYRA_REPORT_WEBHOOK_URL") {
        if !value.trim().is_empty() {
            return discord::validate_webhook(&value).map(Some);
        }
    }
    SecretStore
        .read_report_webhook()?
        .map(|value| discord::validate_webhook(&value))
        .transpose()
}

/// Posts the report and answers with the id the user is shown.
///
/// The id exists so a user can quote their report back ("VR-8F3K2Q still
/// happening") and so the channel message and the attached `context.txt` can
/// be tied together after the fact.
pub async fn deliver(
    webhook: &str,
    report: &Report,
    screenshot_png: Option<Vec<u8>>,
    images: Vec<Attachment>,
    terminal_tail: Option<String>,
) -> Result<String, String> {
    let id = report_id();
    let mut files = Vec::new();
    if let Some(bytes) = screenshot_png {
        files.push(Attachment {
            file_name: crate::report_format::SCREENSHOT_FILE.to_owned(),
            mime: "image/png",
            bytes,
        });
    }
    // Always attached, never conditional: the embed is the triage view and is
    // clipped to stay readable, so the unabridged report has to live somewhere.
    files.push(Attachment {
        file_name: CONTEXT_FILE.to_owned(),
        mime: "text/plain; charset=utf-8",
        bytes: context_text(report, &id, terminal_tail.as_deref()).into_bytes(),
    });
    // The embed can only show one picture inline, so the annotated screenshot
    // keeps that slot and the rest ride as attachments Discord previews below.
    let has_screenshot = !files.is_empty();
    files.extend(images);
    discord::post(webhook, &embed(report, &id, has_screenshot), files).await?;
    Ok(id)
}

/// A short, unambiguous, quotable id — `VR-8F3K2Q`.
///
/// The alphabet drops the characters that are misread when someone types an id
/// back from a screenshot: no O/0, no I/1, no U (which pairs badly with V).
pub(crate) fn report_id() -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHJKLMNPQRSTVWXYZ23456789";
    let mut bytes = [0_u8; 6];
    if getrandom::fill(&mut bytes).is_err() {
        // Time is a weak fallback but never a blocker: an id that repeats is
        // an inconvenience, a report that cannot be sent is a lost bug.
        let now = crate::session_store::now_ms();
        for (index, slot) in bytes.iter_mut().enumerate() {
            *slot = (now >> (index * 8)) as u8;
        }
    }
    let suffix: String = bytes
        .iter()
        .map(|byte| ALPHABET[*byte as usize % ALPHABET.len()] as char)
        .collect();
    format!("VR-{suffix}")
}

/// The report `--test-report-webhook` sends.
///
/// A realistic one rather than "test message": the maintainer is checking that
/// the channel works *and* seeing the shape of what will arrive in it, and a
/// one-line ping shows them neither.
pub fn sample_report() -> Report {
    Report {
        kind: "bug".into(),
        severity: "normal".into(),
        summary: "Sample report — Vibyra reporting is connected".into(),
        details: "This is what a report from inside Vibyra looks like. The embed is the \
triage view; the full text, environment and any terminal output are in the attached \
context.txt."
            .into(),
        steps: Some("1. Open Vibyra\n2. Press the Report button\n3. Describe the problem".into()),
        expected: Some("Reports arrive in this channel within a second or two.".into()),
        area: Some("Reporting".into()),
        contact: None,
        context: ReportContext {
            app_version: env!("CARGO_PKG_VERSION").to_string(),
            platform: format!("{} · {}", std::env::consts::OS, std::env::consts::ARCH),
            reporter: Some("Vibyra setup".into()),
            ..ReportContext::default()
        },
        screenshot: None,
        image_paths: Vec::new(),
        session_id: None,
    }
}
