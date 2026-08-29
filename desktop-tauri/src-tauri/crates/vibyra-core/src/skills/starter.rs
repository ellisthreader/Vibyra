//! The skills a new install starts with.
//!
//! Three, not thirty. A starter library exists to show what a good skill looks
//! like — narrow trigger, real verification, an explicit stop — so the first
//! one a user writes has a shape to copy. A long list would instead teach that
//! skills are decoration, because nobody reads thirty of anything.
//!
//! They are ordinary rows once installed: editable, versioned, removable.

use super::record::SkillDraft;

/// Whether this account has already been seeded. Seeding is one-time and never
/// repeated, so a user who deleted a starter skill does not find it back.
pub const SEED_MARKER: &str = "vibyra.skills.seeded";

pub fn starters() -> Vec<SkillDraft> {
    vec![
        SkillDraft {
            name: "Prove it before saying it works".into(),
            summary:
                "Re-run the original failing case rather than reasoning that a fix should hold"
                    .into(),
            trigger: "Just changed code in response to a bug, a failing test, or a report".into(),
            procedure: "1. Re-run the exact command or steps that first showed the problem.\n\
                        2. Paste the real output, not a summary of it.\n\
                        3. If it still fails, say so plainly and keep going.\n\
                        4. Only then describe what changed."
                .into(),
            verification: "The original reproduction now passes, and its output is in the reply."
                .into(),
            boundary: "Reporting success without having re-run the case.".into(),
        },
        SkillDraft {
            name: "Small, reviewable changes".into(),
            summary: "Keep a change to one intent, with the surrounding code's own conventions"
                .into(),
            trigger: "Editing an existing codebase rather than starting something new".into(),
            procedure: "1. Read enough of the neighbouring files to match their naming, error \
                        handling and comment density.\n\
                        2. Make the change the task asked for and nothing adjacent.\n\
                        3. Leave unrelated formatting, imports and dead code alone.\n\
                        4. Note anything you deliberately did not touch."
                .into(),
            verification: "The diff contains only changes the task asked for.".into(),
            boundary: "Renaming, reformatting or restructuring files the task did not name.".into(),
        },
        SkillDraft {
            name: "Daily standing check".into(),
            summary: "Produce a short, skimmable status a person can act on in a minute".into(),
            trigger: "Running as a scheduled routine with no specific question to answer".into(),
            procedure: "1. Gather only what changed since the last run.\n\
                        2. Lead with anything broken or waiting on a person.\n\
                        3. Keep it under ten lines; link rather than paste.\n\
                        4. Say explicitly when there is nothing to report."
                .into(),
            verification: "The summary names what changed and what, if anything, needs a decision."
                .into(),
            boundary: "Taking action on what you found — report it, do not fix it unattended."
                .into(),
        },
    ]
}
