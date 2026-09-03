//! Cards that outlive the process that asked.

use super::tests::{proposed, seeded};
use super::*;

/// A turn-bound card found pending at startup is a dead process's question.
/// It is invalidated, not left for a yes that would notify nobody; a
/// handoff card, which has no turn, survives because it is still deliverable.
#[test]
fn startup_invalidates_turn_bound_cards_and_keeps_handoffs() {
    let db = seeded();
    let Outcome::Pending(turn_card) =
        request(&db, "acct", proposed("fs.delete", Risk::Destructive), true).unwrap()
    else {
        panic!("a destructive action must raise a card");
    };
    let mut handoff = proposed("mail.handoff", Risk::Publish);
    handoff.chat_id = None;
    handoff.turn_id = None;
    let Outcome::Pending(handoff_card) = request(&db, "acct", handoff, true).unwrap() else {
        panic!("a publish must raise a card");
    };

    assert_eq!(invalidate_orphans(&db).unwrap(), 1);

    assert_eq!(
        get(&db, "acct", &turn_card.id).unwrap().state,
        "invalidated"
    );
    assert_eq!(get(&db, "acct", &handoff_card.id).unwrap().state, "pending");
    assert_eq!(pending(&db, "acct").unwrap().len(), 1);
}
