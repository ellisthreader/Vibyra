//! Codex, as a structured chat.
//!
//! Verified against **codex-cli 0.150.1** on 2026-08-29. `codex exec --json`
//! prints one JSON object per line:
//!
//! ```text
//! {"type":"thread.started","thread_id":"01a04e27-…"}
//! {"type":"turn.started"}
//! {"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"ok"}}
//! {"type":"turn.completed","usage":{"input_tokens":18366,…}}
//! ```
//!
//! Two things about resume are load-bearing, both checked against the CLI
//! rather than assumed:
//!
//! * `codex exec resume <id>` **keeps the same `thread_id`**, so a chat is
//!   bound to one conversation for its whole life.
//! * `codex exec resume` does **not** accept `-s`, `-C` or `--add-dir` — they
//!   are flags of `exec`, not of the subcommand. The sandbox has to be set
//!   through `-c sandbox_mode="…"` instead, which was verified to take effect.
//!   Getting this wrong is not a soft failure: the process exits 2 having done
//!   nothing, and every resumed turn in the app would die.
//!
//! `--last` is never used. A chat names its exact thread or it starts a new
//! one; "whichever was most recent" belongs to no particular chat.

use crate::agent_model::PermissionMode;

/// The `-s` value, or the `sandbox_mode` config value, for a permission level.
///
/// `danger-full-access` is reachable, and only from an explicit `Full` standing
/// grant the user made in Vibyra. `--dangerously-bypass-approvals-and-sandbox`
/// is not reachable at all: it removes the approval layer *as well as* the
/// sandbox, and Vibyra's own approvals are not a substitute for the provider's
/// on a machine that is not otherwise contained.
pub fn sandbox(permission: PermissionMode) -> &'static str {
    match permission {
        PermissionMode::Plan => "read-only",
        PermissionMode::Standard => "workspace-write",
        PermissionMode::Full => "danger-full-access",
    }
}

/// Arguments for the first turn of a chat.
///
/// The prompt is not among them: it goes on stdin as `-`, so a prompt cannot
/// be mistaken for a flag however it begins, and its length is not bounded by
/// the platform's argument limit.
pub fn start_args(
    cwd: &str,
    permission: PermissionMode,
    places: &[String],
    model: Option<&str>,
    effort: Option<&str>,
    images: &[String],
) -> Vec<String> {
    let mut args = vec![
        "exec".into(),
        "--json".into(),
        "--skip-git-repo-check".into(),
        "-C".into(),
        cwd.into(),
        "-s".into(),
        sandbox(permission).into(),
    ];
    for place in places {
        args.extend(["--add-dir".into(), place.clone()]);
    }
    push_shared(&mut args, model, effort, images);
    args.push("-".into());
    args
}

/// Arguments for every turn after the first.
///
/// Note the absence of `-C`, `-s` and `--add-dir`: `exec resume` rejects all
/// three. The thread already remembers its working directory, and the sandbox
/// arrives as a config override instead.
pub fn resume_args(
    thread_id: &str,
    permission: PermissionMode,
    model: Option<&str>,
    effort: Option<&str>,
    images: &[String],
) -> Vec<String> {
    let mut args = vec![
        "exec".into(),
        "resume".into(),
        thread_id.into(),
        "--json".into(),
        "--skip-git-repo-check".into(),
        "-c".into(),
        format!("sandbox_mode=\"{}\"", sandbox(permission)),
    ];
    push_shared(&mut args, model, effort, images);
    args.push("-".into());
    args
}

/// The flags both forms take, in one place so they cannot drift apart.
fn push_shared(
    args: &mut Vec<String>,
    model: Option<&str>,
    effort: Option<&str>,
    images: &[String],
) {
    if let Some(model) = model {
        args.extend(["-m".into(), model.into()]);
    }
    if let Some(effort) = effort {
        args.extend(["-c".into(), format!("model_reasoning_effort=\"{effort}\"")]);
    }
    for image in images {
        args.extend(["-i".into(), image.clone()]);
    }
}
