//! Removes optional personal diagnostics before either report transport formats them.

use crate::report::Report;

pub fn redact_unapproved_diagnostics(report: &mut Report) {
    if report.include_diagnostics {
        return;
    }
    report.context.reporter = None;
    report.context.project = None;
    report.context.project_root = None;
    report.context.hardware = None;
    report.context.ip = None;
    report.context.renderer = None;
    report.context.screen = None;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::report::ReportContext;
    use crate::report_text::context_text;

    #[test]
    fn diagnostics_are_removed_before_either_transport_formats_them() {
        let mut report = Report {
            details: "Report body".into(),
            context: ReportContext {
                reporter: Some("private@example.com".into()),
                project_root: Some("/home/private/work".into()),
                renderer: Some("Private GPU".into()),
                screen: Some("3840x2160".into()),
                agent: Some("claude".into()),
                ..ReportContext::default()
            },
            ..Report::default()
        };
        redact_unapproved_diagnostics(&mut report);
        let context = context_text(&report, "VR-TESTID", None);
        for secret in [
            "private@example.com",
            "/home/private/work",
            "Private GPU",
            "3840x2160",
        ] {
            assert!(
                !context.contains(secret),
                "unapproved diagnostic leaked: {secret}"
            );
        }
        assert_eq!(report.context.agent.as_deref(), Some("claude"));
    }
}
