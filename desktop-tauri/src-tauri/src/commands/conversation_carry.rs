//! Taking a conversation with you when a pane changes account.
//!
//! Credentials and transcripts live in the same folder but answer to different
//! things: the CLI signs in from one and resumes from the other. Pointing a
//! pane at a second account therefore hands it a folder that has never seen
//! the chat it was in the middle of, and both CLIs treat an id they cannot
//! resolve as fatal — the pane dies instead of continuing.
//!
//! Copying the transcript across first is enough to fix that, because resuming
//! reads nothing but the file. Verified on 2026-08-25 against claude 2.1.245
//! and codex-cli 0.149.1 by resuming a copied conversation under a config
//! directory that had never held it. Each got past the lookup and stopped only
//! at authentication, which is exactly the step the new account supplies:
//!
//! | CLI    | transcript absent                   | transcript copied in  |
//! |--------|-------------------------------------|-----------------------|
//! | claude | `No conversation found with session…`| `Not logged in`      |
//! | codex  | `no rollout found for thread id …`  | `401 Unauthorized`    |
//!
//! The copy is deliberate rather than a move: the conversation still belongs
//! to the account that paid for it, and switching back has to find it there.

use std::path::Path;

use super::agent_conversations::ConversationStore;
use super::run_blocking;

/// Copies `session` into `to_account`'s transcripts so it can be resumed there.
///
/// Answers whether the destination now holds the conversation, which is what
/// decides between relaunching the pane with `--resume` and starting it clean.
/// A conversation that was never written — a pane opened but not yet spoken to
/// — is not an error; there is simply nothing to carry, and `false` sends the
/// pane down the fresh-start path it would have taken anyway.
#[tauri::command]
pub async fn carry_agent_conversation(
    agent_id: String,
    session_id: String,
    from_account: Option<String>,
    to_account: Option<String>,
) -> Result<bool, String> {
    run_blocking(move || {
        Ok(carry(
            &agent_id,
            &session_id,
            from_account.as_deref(),
            to_account.as_deref(),
        ))
    })
    .await
}

/// The move itself, with every step allowed to decline.
///
/// Nothing here is worth failing a switch over: the user asked to change
/// account, and a conversation that cannot come along is a reason to start
/// fresh, not a reason to leave them on the old one. Every unreadable path
/// therefore reads as "it did not come", never as an error.
fn carry(agent: &str, session: &str, from_account: Option<&str>, to_account: Option<&str>) -> bool {
    let source = ConversationStore::detect(agent, from_account);
    let Some(relative) = source.locate(agent, session) else {
        return false;
    };
    let Some(source_root) = source.transcript_root(agent) else {
        return false;
    };
    let destination = ConversationStore::detect(agent, to_account);
    let Some(destination_root) = destination.transcript_root(agent) else {
        return false;
    };
    copy_transcript(
        &source_root.join(&relative),
        &destination_root.join(&relative),
    )
}

/// Copies one transcript, keeping whichever copy has more of the conversation.
///
/// Switching back and forth means copying in both directions over time, and
/// the account being left is the one that has just been written to. Overwriting
/// unconditionally would let a stale copy from an earlier visit clobber
/// messages the user sent since, so the older file never wins.
fn copy_transcript(source: &Path, destination: &Path) -> bool {
    if modified_at(destination)
        .is_some_and(|existing| modified_at(source).is_some_and(|incoming| existing >= incoming))
    {
        return true;
    }
    let Some(parent) = destination.parent() else {
        return false;
    };
    if std::fs::create_dir_all(parent).is_err() {
        return false;
    }
    std::fs::copy(source, destination).is_ok()
}

fn modified_at(path: &Path) -> Option<std::time::SystemTime> {
    std::fs::metadata(path).ok()?.modified().ok()
}

#[cfg(test)]
#[path = "conversation_carry_tests.rs"]
mod tests;
