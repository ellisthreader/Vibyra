//! The Discord embed a report arrives as.
//!
//! Optimised for triage rather than completeness: kind and severity are in the
//! title so a channel can be skimmed, the colour encodes urgency, and the
//! fields answer "where" before "what". Everything that would bury that view —
//! full details, environment, terminal output — goes to `context.txt`, which
//! `report_text` builds.

use serde_json::{json, Value};

use crate::report::Report;

pub(crate) const SCREENSHOT_FILE: &str = "screenshot.png";

/// Discord allows 4096 for a description and 1024 per field. These are lower
/// on purpose: past roughly this much the channel stops being skimmable, and
/// the unabridged text is attached anyway.
const MAX_DESCRIPTION: usize = 1_500;
const MAX_FIELD: usize = 700;
const MAX_SUMMARY: usize = 180;

pub(crate) fn kind_label(kind: &str) -> &'static str {
    match kind {
        "crash" => "💥 Crash",
        "visual" => "🎨 Visual glitch",
        "performance" => "🐌 Performance",
        "idea" => "💡 Idea",
        "question" => "❓ Question",
        _ => "🐞 Bug",
    }
}

pub(crate) fn severity_label(severity: &str) -> &'static str {
    match severity {
        "blocker" => "Blocker",
        "high" => "High",
        "low" => "Low",
        _ => "Normal",
    }
}

/// Red through grey. A channel of these reads as a heat map before a word of
/// it is read.
fn severity_color(severity: &str) -> u32 {
    match severity {
        "blocker" => 0x00e5_484d,
        "high" => 0x00f7_6808,
        "low" => 0x008b_8f9e,
        _ => 0x005b_7cfa,
    }
}

/// Clips on a character boundary and marks that it happened, so nobody reads a
/// truncated sentence as the whole report.
pub(crate) fn clip(value: &str, max: usize) -> String {
    let value = value.trim();
    if value.chars().count() <= max {
        return value.to_owned();
    }
    let mut clipped: String = value.chars().take(max.saturating_sub(1)).collect();
    clipped.push('…');
    clipped
}

/// An em dash rather than an empty string: a blank field in Discord renders as
/// a gap that reads like a bug in the report tool itself.
pub(crate) fn or_dash(value: Option<&str>) -> String {
    let text = value.map(str::trim).unwrap_or_default();
    if text.is_empty() {
        "—".to_owned()
    } else {
        text.to_owned()
    }
}

fn field(name: &str, value: String, inline: bool) -> Value {
    json!({ "name": name, "value": clip(&value, MAX_FIELD), "inline": inline })
}

fn filled(value: Option<&String>) -> Option<&str> {
    value
        .map(String::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
}

/// RFC 3339 in UTC. Discord renders its own `timestamp` in each reader's local
/// time, which is worth more than any string Vibyra could format here.
pub(crate) fn iso_now() -> String {
    let now = time::OffsetDateTime::now_utc();
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        now.year(),
        u8::from(now.month()),
        now.day(),
        now.hour(),
        now.minute(),
        now.second()
    )
}

fn context_fields(report: &Report, fields: &mut Vec<Value>) {
    let context = &report.context;
    fields.push(field("Where", or_dash(filled(report.area.as_ref())), true));
    fields.push(field("Version", or_dash(Some(&context.app_version)), true));
    fields.push(field("Platform", or_dash(Some(&context.platform)), true));
    // Only shown when there is a workspace to speak of. On the Home screen
    // three em dashes in a row say nothing and cost a third of the embed.
    if filled(context.project.as_ref()).is_some() || filled(context.agent.as_ref()).is_some() {
        fields.push(field(
            "Project",
            or_dash(filled(context.project.as_ref())),
            true,
        ));
        fields.push(field(
            "Agent",
            or_dash(filled(context.agent.as_ref())),
            true,
        ));
        fields.push(field(
            "Model",
            or_dash(filled(context.model.as_ref())),
            true,
        ));
    }
}

pub(crate) fn embed(report: &Report, id: &str, has_screenshot: bool) -> Value {
    let mut fields = Vec::new();
    context_fields(report, &mut fields);
    if let Some(steps) = filled(report.steps.as_ref()) {
        fields.push(field("Steps to reproduce", steps.to_owned(), false));
    }
    if let Some(expected) = filled(report.expected.as_ref()) {
        fields.push(field("Expected", expected.to_owned(), false));
    }
    let reporter = filled(report.contact.as_ref())
        .or_else(|| filled(report.context.reporter.as_ref()))
        .unwrap_or("anonymous");
    let mut embed = json!({
        // The author line puts the person at the very top of the embed. Who
        // hit a bug decides how it is answered — and whether it can be.
        "author": { "name": format!("Reported by {reporter}") },
        "title": clip(&format!(
            "{} · {} — {}",
            kind_label(&report.kind),
            severity_label(&report.severity),
            clip(&report.summary, MAX_SUMMARY),
        ), 250),
        "description": clip(&report.details, MAX_DESCRIPTION),
        "color": severity_color(&report.severity),
        "fields": fields,
        "timestamp": iso_now(),
        "footer": { "text": format!("{id} · from {reporter} · full context attached") },
    });
    if has_screenshot {
        embed["image"] = json!({ "url": format!("attachment://{SCREENSHOT_FILE}") });
    }
    json!({ "embeds": [embed] })
}
