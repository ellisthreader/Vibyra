use super::{frames, scaffold::SharedScaffolds, workspace::SharedWorkspace};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use std::{collections::BTreeMap, sync::mpsc, sync::Arc, time::Duration};
use vibyra_core::pty::PtyManager;

/// Streams one phone everything this Mac's terminals do: which sessions exist,
/// the grid each is drawn for, and their output as it arrives.
///
/// Output goes out in pieces that each fit one encrypted message, with every
/// piece's own end offset, so the phone's ledger joins them without a gap.
///
/// Every send blocks rather than dropping. `try_send` treated a *full* channel
/// exactly like a disconnected one and left the loop, so a burst across many
/// terminals silently ended the phone's live stream for the rest of the
/// connection. The consumer drains on a 20 ms tick, so the worst this costs is
/// a slightly slower poll; only a real disconnect ends the thread now.
pub fn stream(
    manager: Arc<PtyManager>,
    workspace: SharedWorkspace,
    scaffolds: SharedScaffolds,
    typing: Arc<AtomicBool>,
    generation: String,
) -> mpsc::Receiver<Value> {
    let (send, receive) = mpsc::sync_channel(64);
    std::thread::spawn(move || {
        std::thread::spawn(move || {
            let mut offsets = BTreeMap::new();
            let mut sizes = BTreeMap::new();
            let mut previous = (Vec::new(), u64::MAX, false);
            let mut seq = 0u64;
            loop {
                let sessions = manager.list();
                // The workspace revision belongs in here beside the terminals:
                // renaming a project, or moving a pane between two, changes the
                // phone's page without any terminal starting or stopping. So
                // does the typing switch, which gives or takes the phone's box.
                let state = (
                    sessions
                        .iter()
                        .take(128)
                        .map(|s| (s.id, s.alive))
                        .collect::<Vec<_>>(),
                    workspace.read().revision(),
                    typing.load(Ordering::SeqCst),
                );
                seq += 1;
                if state != previous
                    && send
                        .send(json!({"event":"host.changed","seq":seq,"data":{}}))
                        .is_err()
                {
                    break;
                }
                previous = state;
                // A build's step, output and outcome, queued by the scaffold
                // thread since the last tick. They ride this stream rather than
                // one of their own so the phone keeps a single ordered feed.
                let mut stopped = false;
                for mut event in scaffolds.lock().drain() {
                    seq += 1;
                    event["seq"] = json!(seq);
                    if send.send(event).is_err() {
                        stopped = true;
                        break;
                    }
                }
                if stopped {
                    break;
                }
                // A heartbeat also detects disconnected receivers when every terminal is idle.
                if send
                    .send(json!({"event":"desktop.heartbeat","seq":seq,"data":{}}))
                    .is_err()
                {
                    break;
                }
                let mut dropped = false;
                // The phone renders this Mac's grid, so a pane the person
                // resizes here has to reach it; otherwise the viewer keeps
                // laying out for the width it first saw.
                for session in sessions.iter().take(128) {
                    let size = (session.cols, session.rows);
                    if sizes.insert(session.id, size) != Some(size) {
                        seq += 1;
                        if send
                            .send(json!({"event":"terminal.size","seq":seq,
                            "data":{"sessionId":format!("{generation}-{}",session.id),
                            "generation":generation,"cols":size.0,"rows":size.1}}))
                            .is_err()
                        {
                            dropped = true;
                            break;
                        }
                    }
                }
                if dropped {
                    break;
                }
                for session in sessions.iter().take(128) {
                    let Ok((output, offset, _)) = manager.remote_snapshot(session.id) else {
                        continue;
                    };
                    let old = offsets.insert(session.id, offset);
                    if old == Some(offset) || (old.is_none() && offset == 0) {
                        continue;
                    }
                    let id = format!("{generation}-{}", session.id);
                    let start = offset.saturating_sub(output.len() as u64);
                    // Only output this phone has not had is sent. A terminal
                    // seen for the first time, or one whose ring has dropped
                    // bytes since the last poll, is flagged instead: the phone
                    // reads what a terminal holds from `session.snapshot`, and
                    // resending that history here cost up to 256 KiB a terminal
                    // on every connect.
                    let new = old
                        .filter(|old| *old >= start)
                        .and_then(|old| Some((old, output.get((old - start) as usize..)?)));
                    let events: Vec<Value> = match new {
                        Some((mut end, new)) => frames::pieces(new)
                            .into_iter()
                            .map(|piece| {
                                end += piece.len() as u64;
                                json!({"event":"terminal.output","data":{"sessionId":id,
                                    "generation":generation,"output":piece,"offset":end}})
                            })
                            .collect(),
                        None => vec![
                            json!({"event":"terminal.resync","data":{"sessionId":id,"generation":generation}}),
                        ],
                    };
                    for mut event in events {
                        seq += 1;
                        event["seq"] = json!(seq);
                        if send.send(event).is_err() {
                            dropped = true;
                            break;
                        }
                    }
                    if dropped {
                        break;
                    }
                }
                if dropped {
                    break;
                }
                offsets.retain(|id, _| sessions.iter().any(|s| s.id == *id));
                sizes.retain(|id, _| sessions.iter().any(|s| s.id == *id));
                std::thread::sleep(Duration::from_millis(200));
            }
        });
    });
    receive
}
