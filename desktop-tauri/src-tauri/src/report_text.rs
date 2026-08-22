//! `context.txt` — the unabridged report, attached to every message.
//!
//! Plain text on purpose. It is opened in a Discord preview pane, pasted into
//! an issue, or grepped; none of those want markdown. The embed is the triage
//! view, this is the debugging one, and nothing here is clipped.

use crate::report::Report;
use crate::report_format::{iso_now, kind_label, or_dash, severity_label};

pub(crate) const CONTEXT_FILE: &str = "context.txt";

/// Terminal output is the single most useful thing in a report and the single
/// most likely to be enormous, so only the tail travels.
const MAX_TAIL_LINES: usize = 120;
const MAX_TAIL_BYTES: usize = 40_000;

fn row(label: &str, value: &str) -> String {
    format!("{label:<14}{value}\n")
}

fn section(title: &str, body: &str) -> String {
    let body = body.trim();
    if body.is_empty() {
        return String::new();
    }
    format!("\n--- {title} ---\n{body}\n")
}

fn optional(value: Option<&String>) -> String {
    or_dash(value.map(String::as_str))
}

fn environment(report: &Report) -> String {
    let context = &report.context;
    let mut out = String::new();
    out.push_str(&row("App version", &or_dash(Some(&context.app_version))));
    out.push_str(&row("Platform", &or_dash(Some(&context.platform))));
    out.push_str(&row("Renderer", &optional(context.renderer.as_ref())));
    out.push_str(&row("Screen", &optional(context.screen.as_ref())));
    out.push_str(&row("Locale", &optional(context.locale.as_ref())));
    out.push_str(&row("View", &optional(context.view.as_ref())));
    out.push_str(&row("Project", &optional(context.project.as_ref())));
    out.push_str(&row("Folder", &optional(context.project_root.as_ref())));
    out.push_str(&row("Agent", &optional(context.agent.as_ref())));
    out.push_str(&row("Model", &optional(context.model.as_ref())));
    out.push_str(&row("Pane", &optional(context.pane.as_ref())));
    out.push_str(&row("Reporter", &optional(context.reporter.as_ref())));
    out.push_str(&row("Contact", &optional(report.contact.as_ref())));
    out
}

pub(crate) fn context_text(report: &Report, id: &str, terminal_tail: Option<&str>) -> String {
    let mut out = format!("Vibyra report {id}\n{}\n\n", iso_now());
    out.push_str(&row("Kind", kind_label(&report.kind)));
    out.push_str(&row("Severity", severity_label(&report.severity)));
    out.push_str(&row("Where", &optional(report.area.as_ref())));
    out.push_str(&row("Summary", report.summary.trim()));
    out.push_str(&section("What happened", &report.details));
    out.push_str(&section(
        "Steps to reproduce",
        report.steps.as_deref().unwrap_or_default(),
    ));
    out.push_str(&section(
        "Expected",
        report.expected.as_deref().unwrap_or_default(),
    ));
    out.push_str(&section("Environment", &environment(report)));
    if let Some(tail) = terminal_tail {
        out.push_str(&section(
            &format!("Terminal output (last {MAX_TAIL_LINES} lines)"),
            tail,
        ));
    }
    out
}

/// Keeps the end of a terminal's scrollback, readable.
///
/// Two things have to go: the escape sequences, which turn a text file into
/// line noise, and the volume — a build loop's output would dwarf the report
/// it is attached to. The tail is kept because the failure is at the end.
pub(crate) fn terminal_tail(snapshot: &str) -> String {
    let plain = strip_ansi(snapshot);
    let lines: Vec<&str> = plain.lines().collect();
    let start = lines.len().saturating_sub(MAX_TAIL_LINES);
    let mut tail = lines[start..].join("\n");
    if tail.len() > MAX_TAIL_BYTES {
        let mut cut = tail.len() - MAX_TAIL_BYTES;
        while cut < tail.len() && !tail.is_char_boundary(cut) {
            cut += 1;
        }
        tail = tail[cut..].to_owned();
    }
    tail.trim_end().to_owned()
}

/// Strips CSI/OSC escape sequences and carriage returns.
///
/// Deliberately a scanner rather than a regex: a progress bar rewriting itself
/// with `\r` leaves the line duplicated dozens of times, and dropping the
/// carriage returns collapses it back to what the user actually saw.
fn strip_ansi(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    while let Some(current) = chars.next() {
        match current {
            '\r' => continue,
            '\u{1b}' => {
                match chars.peek() {
                    // CSI: runs until a byte in the @-~ range.
                    Some('[') => {
                        chars.next();
                        for inner in chars.by_ref() {
                            if ('\u{40}'..='\u{7e}').contains(&inner) {
                                break;
                            }
                        }
                    }
                    // OSC: runs until BEL or the ESC of a String Terminator.
                    Some(']') => {
                        chars.next();
                        for inner in chars.by_ref() {
                            if inner == '\u{7}' || inner == '\u{1b}' {
                                break;
                            }
                        }
                    }
                    // Any other two-character escape.
                    Some(_) => {
                        chars.next();
                    }
                    None => break,
                }
            }
            _ => out.push(current),
        }
    }
    out
}
