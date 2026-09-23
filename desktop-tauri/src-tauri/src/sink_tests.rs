use std::sync::Arc;

use parking_lot::Mutex;
use tauri::ipc::{Channel, InvokeResponseBody};
use vibyra_core::pty::OutputSink;

use super::{ChannelSink, TermEvent};

fn channel() -> (Channel<TermEvent>, Arc<Mutex<Vec<String>>>) {
    let seen = Arc::new(Mutex::new(Vec::new()));
    let log = Arc::clone(&seen);
    let channel = Channel::new(move |body| {
        if let InvokeResponseBody::Json(json) = body {
            log.lock().push(json);
        }
        Ok(())
    });
    (channel, seen)
}

#[test]
fn an_exit_after_the_view_let_go_leaves_no_route_behind() {
    let sink = ChannelSink::default();
    let (view, seen) = channel();
    sink.attach(1, view);
    sink.on_output(1, "hi".into());
    sink.detach(1);
    sink.on_output(1, "late".into());
    sink.on_exit(1, Some(0));
    assert!(sink.routes.lock().is_empty());
    assert_eq!(seen.lock().len(), 1);

    // Letting go after the exit removes the route at once.
    let (view, _) = channel();
    sink.attach(2, view);
    sink.on_exit(2, None);
    sink.detach(2);
    assert!(sink.routes.lock().is_empty());
}

#[test]
fn an_exit_before_the_view_attaches_is_still_delivered() {
    let sink = ChannelSink::default();
    sink.on_exit(3, Some(1));
    let (view, seen) = channel();
    sink.attach(3, view);
    assert_eq!(seen.lock().as_slice(), [r#"{"type":"exit","code":1}"#]);
}

#[test]
fn a_late_release_does_not_cut_off_the_view_that_replaced_it() {
    let sink = ChannelSink::default();
    let (old, _) = channel();
    let old_id = old.id();
    sink.attach(4, old);
    let (new, seen) = channel();
    let new_id = new.id();
    sink.attach(4, new);
    assert!(!sink.release(4, old_id));
    sink.on_output(4, "still here".into());
    assert_eq!(seen.lock().len(), 1);
    assert!(sink.release(4, new_id));
    // A released view can be attached again, as the shared CLI does.
    let (again, seen) = channel();
    sink.attach(4, again);
    sink.on_output(4, "back".into());
    assert_eq!(seen.lock().len(), 1);
}
