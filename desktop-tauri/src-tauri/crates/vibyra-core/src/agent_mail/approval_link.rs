//! A handoff that became a decision, and the answer finding its way back.
//!
//! The message is written first with status `awaitingApproval`, then the card
//! is raised, then the two are linked. If the process dies between the second
//! and third step the card stands alone and its answer moves no mail — which
//! is the safe way round: nothing is delivered on the strength of a link that
//! was never made.

use rusqlite::params;

use crate::agentdb::{sql, AgentDb};
use crate::error::CoreResult;

use super::queries::{message_from_row, COLUMNS};
use super::store::MailMessage;

/// Records which card is deciding this message.
pub fn link_approval(db: &AgentDb, message_id: &str, approval_id: &str) -> CoreResult<()> {
    db.with(|connection| {
        connection
            .execute(
                "UPDATE agent_mail SET approval_id = ?1 WHERE id = ?2",
                params![approval_id, message_id],
            )
            .map_err(sql)?;
        Ok(())
    })
}

/// The message a card is about, if the card came from a handoff.
pub fn by_approval(db: &AgentDb, approval_id: &str) -> CoreResult<Option<MailMessage>> {
    db.with(|connection| {
        let query = format!("SELECT {COLUMNS} FROM agent_mail WHERE approval_id = ?1 LIMIT 1");
        Ok(connection
            .query_row(&query, params![approval_id], message_from_row)
            .ok())
    })
}

/// Moves a message on once its decision is in: `delivered` or `refused`.
pub fn set_status(db: &AgentDb, message_id: &str, status: &str) -> CoreResult<()> {
    db.with(|connection| {
        connection
            .execute(
                "UPDATE agent_mail SET status = ?1 WHERE id = ?2",
                params![status, message_id],
            )
            .map_err(sql)?;
        Ok(())
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_mail::{send, Delivery, Handoff};

    fn handoff(body: &str) -> Handoff {
        Handoff {
            sender_id: "a".into(),
            sender_name: "Nia".into(),
            recipient_id: "b".into(),
            body: body.into(),
            parent_id: None,
        }
    }

    fn db() -> AgentDb {
        let db = AgentDb::open_memory().unwrap();
        db.with(|connection| {
            for (id, name) in [("a", "Nia"), ("b", "Ash")] {
                connection
                    .execute(
                        "INSERT INTO agent_profiles \
                         (id, account, name, engine, home_path, created_ms, updated_ms) \
                         VALUES (?1, 'acct', ?2, 'claude', '/tmp/x', 1, 1)",
                        rusqlite::params![id, name],
                    )
                    .map_err(sql)?;
            }
            Ok(())
        })
        .unwrap();
        crate::agent_mail::set_allowlist(&db, "a", &["b".into()]).unwrap();
        db
    }

    /// The link is what lets an answer move the message; without it the card
    /// resolves and the mail stays exactly where it was.
    #[test]
    fn a_decision_finds_its_handoff_and_moves_it_on() {
        let db = db();
        let Delivery::NeedsApproval { message, phrase } = send(
            &db,
            false,
            handoff("please publish the release"),
            "Ash",
            true,
        )
        .unwrap() else {
            panic!("an escalating handoff raises a decision");
        };
        assert_eq!(phrase, "publish");
        assert_eq!(message.status, "awaitingApproval");

        assert!(by_approval(&db, "card-1").unwrap().is_none());
        link_approval(&db, &message.id, "card-1").unwrap();
        let found = by_approval(&db, "card-1").unwrap().expect("linked");
        assert_eq!(found.id, message.id);
        assert_eq!(found.body, "please publish the release");

        set_status(&db, &message.id, "delivered").unwrap();
        assert_eq!(
            by_approval(&db, "card-1").unwrap().unwrap().status,
            "delivered"
        );
    }
}
