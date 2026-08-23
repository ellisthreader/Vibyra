//! A user-submitted report, on its way to the maintainer's Discord channel.
//!
//! The shape is deliberately wider than "what went wrong": a report that
//! cannot say *where* it happened costs a round trip to find out, and the user
//! who hit the bug is rarely still there to answer. So the frontend gathers
//! the surrounding state — version, platform, project, agent, model, the pane
//! that was in front — and shows the user exactly what it collected before
//! they send it.

use serde::{Deserialize, Serialize};

/// Bounds on what one submission may carry. Generous for a person typing, far
/// below anything that would trouble Discord.
const MAX_SUMMARY: usize = 300;
const MAX_BODY: usize = 8_000;

/// Where the user was standing when they hit Report. Every field is optional
/// because a report from the Home screen has no project, and one sent before
/// any terminal is open has no agent.
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
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

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
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
