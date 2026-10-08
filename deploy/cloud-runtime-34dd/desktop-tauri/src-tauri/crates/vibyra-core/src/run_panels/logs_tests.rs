use super::*;

fn v(lines: &[&str]) -> Vec<String> {
    lines.iter().map(|s| s.to_string()).collect()
}

#[test]
fn a_sliding_window_adds_only_the_new_tail() {
    let first = v(&["a", "b", "c"]);
    assert_eq!(fresh_lines(&[], &first), &first[..]);
    assert_eq!(
        fresh_lines(&first, &v(&["b", "c", "d", "e"])),
        &v(&["d", "e"])[..]
    );
    assert!(fresh_lines(&first, &first).is_empty());
    // A restarted server prints a window that shares nothing with the old one.
    assert_eq!(fresh_lines(&first, &v(&["x"])), &v(&["x"])[..]);
}

#[test]
fn poll_returns_lines_since_the_callers_sequence() {
    let logs = RunLogs::default();
    let (batch, epoch) = logs.poll("p", &[("web".into(), v(&["[web] one", "[web] two"]))], 0, 0);
    assert_eq!(batch.lines.len(), 2);
    assert_eq!(batch.seq, 2);
    let (batch, _) = logs.poll(
        "p",
        &[("web".into(), v(&["[web] one", "[web] two", "[web] three"]))],
        2,
        epoch,
    );
    assert_eq!(
        batch
            .lines
            .iter()
            .map(|l| l.text.as_str())
            .collect::<Vec<_>>(),
        ["[web] three"]
    );
    assert!(!batch.reset);
}

#[test]
fn clear_forgets_lines_but_does_not_replay_what_preview_still_holds() {
    let logs = RunLogs::default();
    let window = ("web".to_string(), v(&["a", "b"]));
    let (_, epoch) = logs.poll("p", std::slice::from_ref(&window), 0, 0);
    logs.clear("p");
    let (batch, new_epoch) = logs.poll("p", std::slice::from_ref(&window), 2, epoch);
    assert!(batch.reset && batch.lines.is_empty());
    assert_eq!(new_epoch, epoch + 1);
    let (batch, _) = logs.poll("p", &[("web".into(), v(&["a", "b", "c"]))], 0, new_epoch);
    assert_eq!(batch.lines.len(), 1);
}

#[test]
fn the_ring_is_bounded() {
    let logs = RunLogs::default();
    let many: Vec<String> = (0..RING_LINES + 300).map(|n| format!("line {n}")).collect();
    for chunk in many.chunks(100) {
        logs.poll("p", &[("t".into(), chunk.to_vec())], 0, 0);
    }
    let (batch, _) = logs.poll("p", &[], 0, 0);
    assert_eq!(batch.lines.len(), RING_LINES);
    assert_eq!(
        batch.lines.last().unwrap().text,
        format!("line {}", RING_LINES + 299)
    );
}

#[test]
fn projects_have_separate_rings() {
    let logs = RunLogs::default();
    logs.poll("a", &[("t".into(), v(&["x"]))], 0, 0);
    let (batch, _) = logs.poll("b", &[], 0, 0);
    assert!(batch.lines.is_empty());
}
