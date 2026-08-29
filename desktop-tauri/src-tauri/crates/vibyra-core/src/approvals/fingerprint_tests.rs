//! Digest tests.
//!
//! Two properties, and both are the difference between a token that guards an
//! action and one that merely accompanies it: every field that could change
//! the effect moves the digest, and adjacent fields cannot be slid into each
//! other to produce the same bytes from a different action.

use super::*;

fn proposed(action: &str, risk: Risk) -> ProposedAction {
    ProposedAction {
        agent_id: Some("a".into()),
        agent_name: "Nia".into(),
        chat_id: Some("c".into()),
        turn_id: Some("t".into()),
        risk,
        action: action.into(),
        target: "vibyra/vibyra#412".into(),
        detail: "Post a comment saying the release is cut.".into(),
        cost_usd: None,
    }
}

/// Every field that could change the effect is inside the digest. A field left
/// out is a field an agent could alter after approval.
#[test]
fn the_fingerprint_moves_with_every_part_of_the_effect() {
    let base = proposed("github.comment", Risk::Publish);
    let baseline = fingerprint(&base);

    let mut retargeted = base.clone();
    retargeted.target = "vibyra/vibyra#999".into();
    let mut rewritten = base.clone();
    rewritten.detail = "Post something else entirely.".into();
    let mut priced = base.clone();
    priced.cost_usd = Some(4.0);
    let mut other_turn = base.clone();
    other_turn.turn_id = Some("t2".into());

    for changed in [retargeted, rewritten, priced, other_turn] {
        assert_ne!(
            fingerprint(&changed),
            baseline,
            "a change did not move the digest"
        );
    }
    assert_eq!(fingerprint(&base), baseline, "the digest is stable");
}

/// Length prefixing: `("ab","c")` and `("a","bc")` are different actions, not
/// the same stream of bytes.
#[test]
fn adjacent_fields_cannot_be_slid_into_each_other() {
    let mut left = proposed("github.comment", Risk::Publish);
    left.action = "ab".into();
    left.target = "c".into();
    let mut right = left.clone();
    right.action = "a".into();
    right.target = "bc".into();

    assert_ne!(fingerprint(&left), fingerprint(&right));
}
